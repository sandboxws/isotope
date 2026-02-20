// Package expr implements SQL expression evaluation against Arrow RecordBatches.
// It uses TiDB's SQL parser to parse expressions and dispatches to Arrow compute kernels
// where available, with manual implementations for functions not in Arrow Go compute.
package expr

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/compute"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/apache/arrow-go/v18/arrow/scalar"

	"github.com/pingcap/tidb/pkg/parser"
	"github.com/pingcap/tidb/pkg/parser/ast"
	"github.com/pingcap/tidb/pkg/parser/opcode"
	"github.com/pingcap/tidb/pkg/parser/test_driver"
)

// Evaluator evaluates SQL expressions against Arrow RecordBatches.
type Evaluator struct {
	alloc  memory.Allocator
	parser *parser.Parser
}

// NewEvaluator creates a new expression evaluator.
func NewEvaluator(alloc memory.Allocator) *Evaluator {
	return &Evaluator{
		alloc:  alloc,
		parser: parser.New(),
	}
}

// parseExpr parses a standalone SQL expression by wrapping it in a SELECT statement.
func (ev *Evaluator) parseExpr(exprSQL string) (ast.ExprNode, error) {
	stmt, err := ev.parser.ParseOneStmt("SELECT "+exprSQL, "", "")
	if err != nil {
		return nil, fmt.Errorf("parse expression %q: %w", exprSQL, err)
	}
	sel, ok := stmt.(*ast.SelectStmt)
	if !ok || len(sel.Fields.Fields) == 0 {
		return nil, fmt.Errorf("parse expression %q: unexpected statement type", exprSQL)
	}
	return sel.Fields.Fields[0].Expr, nil
}

// Eval parses and evaluates a SQL expression against a RecordBatch.
// Returns an Arrow Array containing the result. The caller must Release() the returned array.
func (ev *Evaluator) Eval(ctx context.Context, batch arrow.Record, exprSQL string) (arrow.Array, error) {
	expr, err := ev.parseExpr(exprSQL)
	if err != nil {
		return nil, err
	}
	return ev.evalExpr(ctx, batch, expr)
}

// EvalBool evaluates a SQL expression and expects a boolean result.
func (ev *Evaluator) EvalBool(ctx context.Context, batch arrow.Record, exprSQL string) (*array.Boolean, error) {
	result, err := ev.Eval(ctx, batch, exprSQL)
	if err != nil {
		return nil, err
	}
	boolArr, ok := result.(*array.Boolean)
	if !ok {
		result.Release()
		return nil, fmt.Errorf("expression %q did not produce boolean result, got %T", exprSQL, result)
	}
	return boolArr, nil
}

// evalExpr dispatches AST nodes to the appropriate evaluation function.
func (ev *Evaluator) evalExpr(ctx context.Context, batch arrow.Record, expr ast.ExprNode) (arrow.Array, error) {
	switch e := expr.(type) {
	case *ast.ColumnNameExpr:
		return ev.evalColumnRef(batch, e)
	case *test_driver.ValueExpr:
		return ev.evalLiteral(batch, e)
	case *ast.BinaryOperationExpr:
		return ev.evalBinaryOp(ctx, batch, e)
	case *ast.UnaryOperationExpr:
		return ev.evalUnaryOp(ctx, batch, e)
	case *ast.IsNullExpr:
		return ev.evalIsNull(ctx, batch, e)
	case *ast.ParenthesesExpr:
		return ev.evalExpr(ctx, batch, e.Expr)
	case *ast.FuncCallExpr:
		return ev.evalFuncCall(ctx, batch, e)
	case *ast.CaseExpr:
		return ev.evalCase(ctx, batch, e)
	default:
		return nil, fmt.Errorf("unsupported expression type: %T", expr)
	}
}

// ── Column references ───────────────────────────────────────────────

func (ev *Evaluator) evalColumnRef(batch arrow.Record, col *ast.ColumnNameExpr) (arrow.Array, error) {
	name := col.Name.Name.O
	schema := batch.Schema()
	indices := schema.FieldIndices(name)
	if len(indices) == 0 {
		return nil, fmt.Errorf("column %q not found in schema", name)
	}
	arr := batch.Column(indices[0])
	arr.Retain()
	return arr, nil
}

// ── Literals ────────────────────────────────────────────────────────

func (ev *Evaluator) evalLiteral(batch arrow.Record, val *test_driver.ValueExpr) (arrow.Array, error) {
	numRows := int(batch.NumRows())
	d := val.Datum

	switch d.Kind() {
	case test_driver.KindInt64:
		return makeConstantInt64(ev.alloc, d.GetInt64(), numRows), nil
	case test_driver.KindUint64:
		return makeConstantInt64(ev.alloc, int64(d.GetUint64()), numRows), nil
	case test_driver.KindFloat64:
		return makeConstantFloat64(ev.alloc, d.GetFloat64(), numRows), nil
	case test_driver.KindFloat32:
		return makeConstantFloat64(ev.alloc, float64(d.GetFloat32()), numRows), nil
	case test_driver.KindString:
		return makeConstantString(ev.alloc, d.GetString(), numRows), nil
	case test_driver.KindNull:
		return makeNullArray(ev.alloc, arrow.PrimitiveTypes.Int64, numRows), nil
	default:
		return nil, fmt.Errorf("unsupported literal kind: %v", d.Kind())
	}
}

// ── Binary operations (comparisons, arithmetic, logical) ────────────

func (ev *Evaluator) evalBinaryOp(ctx context.Context, batch arrow.Record, expr *ast.BinaryOperationExpr) (arrow.Array, error) {
	left, err := ev.evalExpr(ctx, batch, expr.L)
	if err != nil {
		return nil, err
	}
	defer left.Release()

	right, err := ev.evalExpr(ctx, batch, expr.R)
	if err != nil {
		return nil, err
	}
	defer right.Release()

	// Map TiDB opcodes to Arrow compute kernel names.
	var kernelName string
	switch expr.Op {
	case opcode.EQ:
		kernelName = "equal"
	case opcode.NE:
		kernelName = "not_equal"
	case opcode.GT:
		kernelName = "greater"
	case opcode.LT:
		kernelName = "less"
	case opcode.GE:
		kernelName = "greater_equal"
	case opcode.LE:
		kernelName = "less_equal"
	case opcode.Plus:
		kernelName = "add"
	case opcode.Minus:
		kernelName = "subtract"
	case opcode.Mul:
		kernelName = "multiply"
	case opcode.Div:
		kernelName = "divide"
	case opcode.LogicAnd:
		kernelName = "and"
	case opcode.LogicOr:
		kernelName = "or"
	default:
		return nil, fmt.Errorf("unsupported binary operator: %v", expr.Op)
	}

	return ev.computeBinaryKernel(ctx, left, right, kernelName)
}

func (ev *Evaluator) computeBinaryKernel(ctx context.Context, left, right arrow.Array, kernelName string) (arrow.Array, error) {
	cl, cr, err := coerceTypes(ev.alloc, left, right)
	if err != nil {
		return nil, err
	}
	defer cl.Release()
	defer cr.Release()

	result, err := compute.CallFunction(ctx, kernelName, nil,
		compute.NewDatumWithoutOwning(cl), compute.NewDatumWithoutOwning(cr))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", kernelName, err)
	}
	return extractArray(result)
}

// ── Unary operations ────────────────────────────────────────────────

func (ev *Evaluator) evalUnaryOp(ctx context.Context, batch arrow.Record, expr *ast.UnaryOperationExpr) (arrow.Array, error) {
	inner, err := ev.evalExpr(ctx, batch, expr.V)
	if err != nil {
		return nil, err
	}
	defer inner.Release()

	switch expr.Op {
	case opcode.Not, opcode.Not2:
		// Manual NOT since Arrow Go may not have "invert" registered.
		boolArr, ok := inner.(*array.Boolean)
		if !ok {
			return nil, fmt.Errorf("NOT requires boolean input, got %T", inner)
		}
		return invertBool(ev.alloc, boolArr), nil
	case opcode.Minus:
		result, err := compute.Negate(ctx, compute.ArithmeticOptions{}, compute.NewDatumWithoutOwning(inner))
		if err != nil {
			return nil, fmt.Errorf("unary minus: %w", err)
		}
		return extractArray(result)
	default:
		return nil, fmt.Errorf("unsupported unary operator: %v", expr.Op)
	}
}

// ── IS NULL / IS NOT NULL ───────────────────────────────────────────

func (ev *Evaluator) evalIsNull(_ context.Context, batch arrow.Record, expr *ast.IsNullExpr) (arrow.Array, error) {
	inner, err := ev.evalExpr(context.Background(), batch, expr.Expr)
	if err != nil {
		return nil, err
	}
	defer inner.Release()

	n := inner.Len()
	bldr := array.NewBooleanBuilder(ev.alloc)
	defer bldr.Release()

	for i := 0; i < n; i++ {
		isNull := inner.IsNull(i)
		if expr.Not {
			bldr.Append(!isNull)
		} else {
			bldr.Append(isNull)
		}
	}
	return bldr.NewArray(), nil
}

// ── CASE WHEN ───────────────────────────────────────────────────────

func (ev *Evaluator) evalCase(ctx context.Context, batch arrow.Record, expr *ast.CaseExpr) (arrow.Array, error) {
	numRows := int(batch.NumRows())

	// Evaluate all WHEN conditions and THEN values up front.
	type whenClause struct {
		cond arrow.Array
		val  arrow.Array
	}
	clauses := make([]whenClause, len(expr.WhenClauses))
	for i, when := range expr.WhenClauses {
		cond, err := ev.evalExpr(ctx, batch, when.Expr)
		if err != nil {
			for j := 0; j < i; j++ {
				clauses[j].cond.Release()
				clauses[j].val.Release()
			}
			return nil, fmt.Errorf("CASE WHEN[%d] condition: %w", i, err)
		}
		val, err := ev.evalExpr(ctx, batch, when.Result)
		if err != nil {
			cond.Release()
			for j := 0; j < i; j++ {
				clauses[j].cond.Release()
				clauses[j].val.Release()
			}
			return nil, fmt.Errorf("CASE WHEN[%d] value: %w", i, err)
		}
		clauses[i] = whenClause{cond: cond, val: val}
	}
	defer func() {
		for _, c := range clauses {
			c.cond.Release()
			c.val.Release()
		}
	}()

	var elseArr arrow.Array
	if expr.ElseClause != nil {
		var err error
		elseArr, err = ev.evalExpr(ctx, batch, expr.ElseClause)
		if err != nil {
			return nil, fmt.Errorf("CASE ELSE: %w", err)
		}
		defer elseArr.Release()
	}

	// Determine result type from the first THEN value.
	resultType := clauses[0].val.DataType()

	// Build result row-by-row.
	bldr := array.NewBuilder(ev.alloc, resultType)
	defer bldr.Release()

	for row := 0; row < numRows; row++ {
		matched := false
		for _, c := range clauses {
			boolArr, ok := c.cond.(*array.Boolean)
			if ok && !boolArr.IsNull(row) && boolArr.Value(row) {
				appendValue(bldr, c.val, row)
				matched = true
				break
			}
		}
		if !matched {
			if elseArr != nil {
				appendValue(bldr, elseArr, row)
			} else {
				bldr.AppendNull()
			}
		}
	}

	return bldr.NewArray(), nil
}

// ── Function calls ──────────────────────────────────────────────────

func (ev *Evaluator) evalFuncCall(ctx context.Context, batch arrow.Record, expr *ast.FuncCallExpr) (arrow.Array, error) {
	// TiDB stores lowercase name in FnName.L.
	name := expr.FnName.L

	switch name {
	case "upper":
		return ev.evalStringMap(ctx, batch, expr, strings.ToUpper)
	case "lower":
		return ev.evalStringMap(ctx, batch, expr, strings.ToLower)
	case "trim":
		return ev.evalStringMap(ctx, batch, expr, func(s string) string {
			return strings.TrimFunc(s, unicode.IsSpace)
		})
	case "concat":
		return ev.evalConcat(ctx, batch, expr)
	case "substring", "substr":
		return ev.evalSubstring(ctx, batch, expr)
	case "regexp_extract":
		return ev.evalRegexpExtract(ctx, batch, expr)
	case "coalesce":
		return ev.evalCoalesce(ctx, batch, expr)
	default:
		return nil, fmt.Errorf("unsupported function: %s", name)
	}
}

// evalStringMap applies a Go string function to each element in a string array.
func (ev *Evaluator) evalStringMap(ctx context.Context, batch arrow.Record, expr *ast.FuncCallExpr, fn func(string) string) (arrow.Array, error) {
	if len(expr.Args) != 1 {
		return nil, fmt.Errorf("%s requires 1 argument, got %d", expr.FnName.O, len(expr.Args))
	}

	arg, err := ev.evalExpr(ctx, batch, expr.Args[0])
	if err != nil {
		return nil, err
	}
	defer arg.Release()

	n := arg.Len()
	bldr := array.NewStringBuilder(ev.alloc)
	defer bldr.Release()

	for i := 0; i < n; i++ {
		if arg.IsNull(i) {
			bldr.AppendNull()
		} else {
			bldr.Append(fn(stringValue(arg, i)))
		}
	}
	return bldr.NewArray(), nil
}

// evalConcat concatenates string arguments.
func (ev *Evaluator) evalConcat(ctx context.Context, batch arrow.Record, expr *ast.FuncCallExpr) (arrow.Array, error) {
	if len(expr.Args) < 2 {
		return nil, fmt.Errorf("CONCAT requires at least 2 arguments")
	}

	args := make([]arrow.Array, 0, len(expr.Args))
	for _, argExpr := range expr.Args {
		arg, err := ev.evalExpr(ctx, batch, argExpr)
		if err != nil {
			for _, a := range args {
				a.Release()
			}
			return nil, err
		}
		args = append(args, arg)
	}
	defer func() {
		for _, a := range args {
			a.Release()
		}
	}()

	numRows := int(batch.NumRows())
	bldr := array.NewStringBuilder(ev.alloc)
	defer bldr.Release()

	for row := 0; row < numRows; row++ {
		hasNull := false
		var sb strings.Builder
		for _, arg := range args {
			if arg.IsNull(row) {
				hasNull = true
				break
			}
			sb.WriteString(stringValue(arg, row))
		}
		if hasNull {
			bldr.AppendNull()
		} else {
			bldr.Append(sb.String())
		}
	}

	return bldr.NewArray(), nil
}

// evalSubstring evaluates SUBSTRING(str, start, len).
func (ev *Evaluator) evalSubstring(ctx context.Context, batch arrow.Record, expr *ast.FuncCallExpr) (arrow.Array, error) {
	if len(expr.Args) < 2 || len(expr.Args) > 3 {
		return nil, fmt.Errorf("SUBSTRING requires 2-3 arguments")
	}

	strArg, err := ev.evalExpr(ctx, batch, expr.Args[0])
	if err != nil {
		return nil, err
	}
	defer strArg.Release()

	startArg, err := ev.evalExpr(ctx, batch, expr.Args[1])
	if err != nil {
		return nil, err
	}
	defer startArg.Release()

	var lenArg arrow.Array
	if len(expr.Args) == 3 {
		lenArg, err = ev.evalExpr(ctx, batch, expr.Args[2])
		if err != nil {
			return nil, err
		}
		defer lenArg.Release()
	}

	numRows := int(batch.NumRows())
	bldr := array.NewStringBuilder(ev.alloc)
	defer bldr.Release()

	for row := 0; row < numRows; row++ {
		if strArg.IsNull(row) {
			bldr.AppendNull()
			continue
		}
		s := stringValue(strArg, row)
		start := int(intValue(startArg, row)) - 1 // SQL is 1-indexed.
		if start < 0 {
			start = 0
		}
		if start > len(s) {
			bldr.Append("")
			continue
		}

		if lenArg != nil {
			length := int(intValue(lenArg, row))
			end := start + length
			if end > len(s) {
				end = len(s)
			}
			bldr.Append(s[start:end])
		} else {
			bldr.Append(s[start:])
		}
	}

	return bldr.NewArray(), nil
}

// evalRegexpExtract evaluates REGEXP_EXTRACT(col, pattern, group).
func (ev *Evaluator) evalRegexpExtract(ctx context.Context, batch arrow.Record, expr *ast.FuncCallExpr) (arrow.Array, error) {
	if len(expr.Args) != 3 {
		return nil, fmt.Errorf("REGEXP_EXTRACT requires 3 arguments (col, pattern, group)")
	}

	strArg, err := ev.evalExpr(ctx, batch, expr.Args[0])
	if err != nil {
		return nil, err
	}
	defer strArg.Release()

	patternArg, err := ev.evalExpr(ctx, batch, expr.Args[1])
	if err != nil {
		return nil, err
	}
	defer patternArg.Release()

	groupArg, err := ev.evalExpr(ctx, batch, expr.Args[2])
	if err != nil {
		return nil, err
	}
	defer groupArg.Release()

	pattern := stringValue(patternArg, 0)
	group := int(intValue(groupArg, 0))

	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("REGEXP_EXTRACT: invalid pattern %q: %w", pattern, err)
	}

	numRows := int(batch.NumRows())
	bldr := array.NewStringBuilder(ev.alloc)
	defer bldr.Release()

	for row := 0; row < numRows; row++ {
		if strArg.IsNull(row) {
			bldr.AppendNull()
			continue
		}
		s := stringValue(strArg, row)
		matches := re.FindStringSubmatch(s)
		if matches == nil || group >= len(matches) {
			bldr.AppendNull()
		} else {
			bldr.Append(matches[group])
		}
	}

	return bldr.NewArray(), nil
}

// evalCoalesce evaluates COALESCE(a, b, ...) — returns the first non-null value per row.
func (ev *Evaluator) evalCoalesce(ctx context.Context, batch arrow.Record, expr *ast.FuncCallExpr) (arrow.Array, error) {
	if len(expr.Args) < 1 {
		return nil, fmt.Errorf("COALESCE requires at least 1 argument")
	}

	args := make([]arrow.Array, 0, len(expr.Args))
	for _, argExpr := range expr.Args {
		arg, err := ev.evalExpr(ctx, batch, argExpr)
		if err != nil {
			for _, a := range args {
				a.Release()
			}
			return nil, err
		}
		args = append(args, arg)
	}
	defer func() {
		for _, a := range args {
			a.Release()
		}
	}()

	numRows := int(batch.NumRows())
	// Use the first arg's type for the result.
	resultType := args[0].DataType()
	bldr := array.NewBuilder(ev.alloc, resultType)
	defer bldr.Release()

	for row := 0; row < numRows; row++ {
		found := false
		for _, arg := range args {
			if !arg.IsNull(row) {
				appendValue(bldr, arg, row)
				found = true
				break
			}
		}
		if !found {
			bldr.AppendNull()
		}
	}

	return bldr.NewArray(), nil
}

// ── Utility functions ───────────────────────────────────────────────

func extractArray(d compute.Datum) (arrow.Array, error) {
	switch v := d.(type) {
	case *compute.ArrayDatum:
		return v.MakeArray(), nil
	default:
		return nil, fmt.Errorf("unexpected datum type: %T", d)
	}
}

func invertBool(alloc memory.Allocator, arr *array.Boolean) arrow.Array {
	bldr := array.NewBooleanBuilder(alloc)
	defer bldr.Release()
	for i := 0; i < arr.Len(); i++ {
		if arr.IsNull(i) {
			bldr.AppendNull()
		} else {
			bldr.Append(!arr.Value(i))
		}
	}
	return bldr.NewArray()
}

func makeConstantInt64(alloc memory.Allocator, val int64, n int) arrow.Array {
	sc := scalar.NewInt64Scalar(val)
	arr, _ := scalar.MakeArrayFromScalar(sc, n, alloc)
	return arr
}

func makeConstantFloat64(alloc memory.Allocator, val float64, n int) arrow.Array {
	sc := scalar.NewFloat64Scalar(val)
	arr, _ := scalar.MakeArrayFromScalar(sc, n, alloc)
	return arr
}

func makeConstantString(alloc memory.Allocator, val string, n int) arrow.Array {
	bldr := array.NewStringBuilder(alloc)
	defer bldr.Release()
	for i := 0; i < n; i++ {
		bldr.Append(val)
	}
	return bldr.NewArray()
}

func makeNullArray(alloc memory.Allocator, dt arrow.DataType, n int) arrow.Array {
	bldr := array.NewBuilder(alloc, dt)
	defer bldr.Release()
	for i := 0; i < n; i++ {
		bldr.AppendNull()
	}
	return bldr.NewArray()
}

// appendValue appends a single value from src[row] to the builder.
func appendValue(bldr array.Builder, src arrow.Array, row int) {
	if src.IsNull(row) {
		bldr.AppendNull()
		return
	}
	switch b := bldr.(type) {
	case *array.Int64Builder:
		b.Append(intValue(src, row))
	case *array.Float64Builder:
		b.Append(floatValue(src, row))
	case *array.StringBuilder:
		b.Append(stringValue(src, row))
	case *array.BooleanBuilder:
		b.Append(boolValue(src, row))
	default:
		bldr.AppendNull()
	}
}

func stringValue(arr arrow.Array, row int) string {
	switch a := arr.(type) {
	case *array.String:
		return a.Value(row)
	case *array.Int64:
		return strconv.FormatInt(a.Value(row), 10)
	case *array.Float64:
		return strconv.FormatFloat(a.Value(row), 'f', -1, 64)
	case *array.Boolean:
		if a.Value(row) {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", arr)
	}
}

func intValue(arr arrow.Array, row int) int64 {
	switch a := arr.(type) {
	case *array.Int64:
		return a.Value(row)
	case *array.Int32:
		return int64(a.Value(row))
	case *array.Int16:
		return int64(a.Value(row))
	case *array.Int8:
		return int64(a.Value(row))
	case *array.Float64:
		return int64(a.Value(row))
	case *array.Float32:
		return int64(a.Value(row))
	default:
		return 0
	}
}

func floatValue(arr arrow.Array, row int) float64 {
	switch a := arr.(type) {
	case *array.Float64:
		return a.Value(row)
	case *array.Float32:
		return float64(a.Value(row))
	case *array.Int64:
		return float64(a.Value(row))
	case *array.Int32:
		return float64(a.Value(row))
	default:
		return 0
	}
}

func boolValue(arr arrow.Array, row int) bool {
	if a, ok := arr.(*array.Boolean); ok {
		return a.Value(row)
	}
	return false
}
