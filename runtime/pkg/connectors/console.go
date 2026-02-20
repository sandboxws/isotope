package connectors

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// Console prints Arrow RecordBatches to stdout as formatted tables.
type Console struct {
	maxRows int32
	writer  io.Writer
	count   int64
}

// NewConsole creates a Console sink.
func NewConsole(maxRows int32) *Console {
	return &Console{maxRows: maxRows, writer: os.Stdout}
}

// SetWriter overrides the output writer (default: os.Stdout).
func (c *Console) SetWriter(w io.Writer) { c.writer = w }

func (c *Console) Open(_ *operator.Context) error { return nil }

func (c *Console) WriteBatch(batch arrow.Record) error {
	schema := batch.Schema()
	numCols := schema.NumFields()
	numRows := int(batch.NumRows())

	if c.maxRows > 0 && numRows > int(c.maxRows) {
		numRows = int(c.maxRows)
	}

	// Calculate column widths.
	widths := make([]int, numCols)
	for i := 0; i < numCols; i++ {
		widths[i] = len(schema.Field(i).Name)
	}
	for row := 0; row < numRows; row++ {
		for col := 0; col < numCols; col++ {
			val := formatValue(batch.Column(col), row)
			if len(val) > widths[col] {
				widths[col] = len(val)
			}
		}
	}

	// Print header.
	c.printRow(schema, widths, nil)
	c.printSeparator(widths)

	// Print rows.
	for row := 0; row < numRows; row++ {
		c.printDataRow(batch, widths, row)
	}

	if int(batch.NumRows()) > numRows {
		fmt.Fprintf(c.writer, "... (%d more rows)\n", int(batch.NumRows())-numRows)
	}
	fmt.Fprintln(c.writer)

	c.count += batch.NumRows()
	return nil
}

func (c *Console) Close() error { return nil }

func (c *Console) printRow(schema *arrow.Schema, widths []int, _ []string) {
	var sb strings.Builder
	sb.WriteString("| ")
	for i := 0; i < schema.NumFields(); i++ {
		if i > 0 {
			sb.WriteString(" | ")
		}
		name := schema.Field(i).Name
		sb.WriteString(padRight(name, widths[i]))
	}
	sb.WriteString(" |")
	fmt.Fprintln(c.writer, sb.String())
}

func (c *Console) printSeparator(widths []int) {
	var sb strings.Builder
	sb.WriteString("|-")
	for i, w := range widths {
		if i > 0 {
			sb.WriteString("-|-")
		}
		sb.WriteString(strings.Repeat("-", w))
	}
	sb.WriteString("-|")
	fmt.Fprintln(c.writer, sb.String())
}

func (c *Console) printDataRow(batch arrow.Record, widths []int, row int) {
	var sb strings.Builder
	sb.WriteString("| ")
	for col := 0; col < int(batch.NumCols()); col++ {
		if col > 0 {
			sb.WriteString(" | ")
		}
		val := formatValue(batch.Column(col), row)
		sb.WriteString(padRight(val, widths[col]))
	}
	sb.WriteString(" |")
	fmt.Fprintln(c.writer, sb.String())
}

func formatValue(arr arrow.Array, row int) string {
	if arr.IsNull(row) {
		return "NULL"
	}
	switch a := arr.(type) {
	case *array.Int64:
		return fmt.Sprintf("%d", a.Value(row))
	case *array.Int32:
		return fmt.Sprintf("%d", a.Value(row))
	case *array.Float64:
		return fmt.Sprintf("%.4f", a.Value(row))
	case *array.Float32:
		return fmt.Sprintf("%.4f", a.Value(row))
	case *array.String:
		return a.Value(row)
	case *array.Boolean:
		if a.Value(row) {
			return "true"
		}
		return "false"
	default:
		return "?"
	}
}

func padRight(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}
