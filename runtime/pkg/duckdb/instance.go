//go:build duckdb

package duckdb

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	goduckdb "github.com/marcboeker/go-duckdb"
)

// Instance manages an isolated in-memory DuckDB database.
// Each operator parallel instance gets its own Instance.
type Instance struct {
	db          *sql.DB
	conn        *sql.Conn
	alloc       memory.Allocator
	memoryLimit int64
	releaseView func() // release function from the last RegisterView call
}

// NewInstance creates a new in-memory DuckDB instance with the given memory limit.
// Pass 0 for memoryLimit to use the default (256MB).
func NewInstance(alloc memory.Allocator, memoryLimit int64) (*Instance, error) {
	if memoryLimit == 0 {
		memoryLimit = 256 * 1024 * 1024 // 256MB default
	}

	connector, err := goduckdb.NewConnector("", nil)
	if err != nil {
		return nil, fmt.Errorf("duckdb: create connector: %w", err)
	}

	db := sql.OpenDB(connector)

	// Grab a persistent connection for Arrow operations.
	conn, err := db.Conn(context.Background())
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("duckdb: get connection: %w", err)
	}

	// Set memory limit on this connection.
	limitMB := memoryLimit / (1024 * 1024)
	if limitMB < 1 {
		limitMB = 1
	}
	if _, err := conn.ExecContext(context.Background(), fmt.Sprintf("SET memory_limit='%dMB'", limitMB)); err != nil {
		conn.Close()
		db.Close()
		return nil, fmt.Errorf("duckdb: set memory_limit: %w", err)
	}

	return &Instance{
		db:          db,
		conn:        conn,
		alloc:       alloc,
		memoryLimit: memoryLimit,
	}, nil
}

// Close destroys the DuckDB instance and releases all memory.
func (inst *Instance) Close() error {
	if inst.releaseView != nil {
		inst.releaseView()
		inst.releaseView = nil
	}
	if inst.conn != nil {
		inst.conn.Close()
	}
	if inst.db != nil {
		return inst.db.Close()
	}
	return nil
}

// RegisterView registers an Arrow RecordBatch as a DuckDB view with the given name.
// This enables zero-copy data transfer from Arrow to DuckDB.
func (inst *Instance) RegisterView(batch arrow.Record, name string) error {
	// Release previous view if any.
	if inst.releaseView != nil {
		inst.releaseView()
		inst.releaseView = nil
	}

	return inst.conn.Raw(func(driverConn interface{}) error {
		arrowConn, err := goduckdb.NewArrowFromConn(driverConn.(driver.Conn))
		if err != nil {
			return fmt.Errorf("duckdb: arrow from conn: %w", err)
		}

		recRdr, err := array.NewRecordReader(batch.Schema(), []arrow.Record{batch})
		if err != nil {
			return fmt.Errorf("duckdb: create record reader: %w", err)
		}

		release, err := arrowConn.RegisterView(recRdr, name)
		if err != nil {
			return fmt.Errorf("duckdb: register view: %w", err)
		}
		inst.releaseView = release
		return nil
	})
}

// Query executes a SQL query and returns the result as an Arrow RecordBatch.
func (inst *Instance) Query(querySQL string) (arrow.Record, error) {
	var result arrow.Record
	err := inst.conn.Raw(func(driverConn interface{}) error {
		arrowConn, err := goduckdb.NewArrowFromConn(driverConn.(driver.Conn))
		if err != nil {
			return fmt.Errorf("duckdb: arrow from conn: %w", err)
		}

		rdr, err := arrowConn.QueryContext(context.Background(), querySQL)
		if err != nil {
			return fmt.Errorf("duckdb: query: %w", err)
		}
		defer rdr.Release()

		// Read all record batches from the reader.
		var records []arrow.Record
		for rdr.Next() {
			rec := rdr.Record()
			rec.Retain()
			records = append(records, rec)
		}
		if rdr.Err() != nil {
			for _, r := range records {
				r.Release()
			}
			return fmt.Errorf("duckdb: read results: %w", rdr.Err())
		}

		if len(records) == 0 {
			result = array.NewRecord(rdr.Schema(), nil, 0)
			return nil
		}

		if len(records) == 1 {
			result = records[0]
			return nil
		}

		// Concatenate multiple record batches.
		result, err = concatenateRecords(inst.alloc, records)
		for _, r := range records {
			r.Release()
		}
		return err
	})

	return result, err
}

// concatenateRecords merges multiple records into one.
func concatenateRecords(alloc memory.Allocator, records []arrow.Record) (arrow.Record, error) {
	if len(records) == 0 {
		return nil, fmt.Errorf("no records to concatenate")
	}

	schema := records[0].Schema()
	numCols := int(records[0].NumCols())

	var totalRows int64
	for _, r := range records {
		totalRows += r.NumRows()
	}

	builders := make([]array.Builder, numCols)
	for i := 0; i < numCols; i++ {
		builders[i] = array.NewBuilder(alloc, schema.Field(i).Type)
	}
	defer func() {
		for _, b := range builders {
			b.Release()
		}
	}()

	for _, rec := range records {
		for col := 0; col < numCols; col++ {
			arr := rec.Column(col)
			for row := 0; row < int(rec.NumRows()); row++ {
				if arr.IsNull(row) {
					builders[col].AppendNull()
				} else {
					appendTypedValue(builders[col], arr, row)
				}
			}
		}
	}

	arrays := make([]arrow.Array, numCols)
	for i, b := range builders {
		arrays[i] = b.NewArray()
	}

	result := array.NewRecord(schema, arrays, totalRows)
	for _, a := range arrays {
		a.Release()
	}
	return result, nil
}

func appendTypedValue(bldr array.Builder, src arrow.Array, row int) {
	switch b := bldr.(type) {
	case *array.Int64Builder:
		b.Append(src.(*array.Int64).Value(row))
	case *array.Int32Builder:
		b.Append(src.(*array.Int32).Value(row))
	case *array.Float64Builder:
		b.Append(src.(*array.Float64).Value(row))
	case *array.StringBuilder:
		b.Append(src.(*array.String).Value(row))
	case *array.BooleanBuilder:
		b.Append(src.(*array.Boolean).Value(row))
	default:
		bldr.AppendNull()
	}
}
