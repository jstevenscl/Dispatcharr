import React, { useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  getFilteredRowModel,
} from '@tanstack/react-table'
import API from '../../api'
import { Checkbox, Table as MuiTable, TableHead, TableRow, TableCell, TableBody, Box, TextField, IconButton, TableContainer, Paper, Button, ButtonGroup, Typography, Grid2 } from '@mui/material'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import Filter from './Filter'

// Styles for fixed header and table container
const styles = {
  fixedHeader: {
    position: "sticky", // Make it sticky
    top: 0, // Stick to the top
    backgroundColor: "#fff", // Ensure it has a background
    zIndex: 10, // Ensure it sits above the table
    padding: "10px",
    borderBottom: "2px solid #ccc",
  },
  tableContainer: {
    maxHeight: "400px", // Limit the height for scrolling
    overflowY: "scroll", // Make it scrollable
    marginTop: "50px", // Adjust margin to avoid overlap with fixed header
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
};

const Table = ({ customToolbar: CustomToolbar , name = null, tableHeight = null, data, columnDef, addAction = null, bulkDeleteAction = null }) => {
  const [rowSelection, setRowSelection] = useState({})
  const [columnFilters, setColumnFilters] = useState([])

  // Define columns with useMemo, this is a stable object and doesn't change unless explicitly modified
  const columns = useMemo(() => columnDef, []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,

    filterFns: {},

    onRowSelectionChange: setRowSelection, //hoist up the row selection state to your own scope
    state: {
      rowSelection, //pass the row selection state back to the table instance
      columnFilters,
    },

    onColumnFiltersChange: setColumnFilters,
  })

  const parentRef = React.useRef(null)

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 20,
  })

  const deleteSelected = async () => {
    const ids = Object.keys(rowSelection).map(index => data[parseInt(index)].id)
    bulkDeleteAction(ids)
  }

  return (
    <>
      {/* Sticky Toolbar */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1100,
          backgroundColor: "white",
          borderTop: "1px solid #ddd",
          borderBottom: "1px solid #ddd",
          padding: "8px",
        }}
      >
        <Grid2 container direction="row" spacing={3} sx={{
          // justifyContent: "center",
          alignItems: "center",
          height: 30,
        }}>
          {name && <Typography>{name}</Typography>}
          {CustomToolbar && <CustomToolbar rowSelection={rowSelection} />}
          {!CustomToolbar && <Grid2>
            {addAction && <IconButton
                size="small" // Makes the button smaller
                color="info" // Red color for delete actions
                variant="contained"
                onClick={addAction}
              >
                <AddIcon fontSize="small" /> {/* Small icon size */}
              </IconButton>}
              {bulkDeleteAction && <IconButton
                size="small" // Makes the button smaller
                color="error" // Red color for delete actions
                variant="contained"
                onClick={deleteSelected}
              >
                <DeleteIcon fontSize="small" /> {/* Small icon size */}
              </IconButton>}
            </Grid2>
          }
        </Grid2>
      </Box>
      <div ref={parentRef}>
        <Box
          ref={parentRef}
          sx={{
            height: tableHeight || "calc(100vh - 40px)", // 50% of the viewport height
            overflow: "auto", // Enable scrollbars
            width: "100%",
          }}
        >
          <TableContainer component={Paper} sx={{ maxHeight: "calc(100vh - 64px - 40px)" }}>
            <MuiTable stickyHeader style={{ width: '100%' }} size="small">
              <TableHead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow>
                    {headerGroup.headers.map((header) => (
                      <TableCell key={header.id} className="text-xs" sx={{
                        paddingTop: 0,
                        paddingBottom: 0,
                      }} >
                          {header.column.getCanFilter() ? (
                              <div>
                                <Filter column={header.column} />
                              </div>
                            ) : header.isPlaceholder
                            ? null
                            : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableHead>
              <TableBody>
                {/* Virtualized rows */}
                {rowVirtualizer.getVirtualItems().map((virtualRow, index) => {
                  const row = rows[virtualRow.index];
                  return (
                    <TableRow key={row.original.id} sx={{
                      // transform: `translateY(${virtualRow.start}px)`,
                      backgroundColor: index % 2 === 0 ? 'grey.100' : 'white',
                      '&:hover': {
                        backgroundColor: 'grey.200',
                      },
                    }}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          // onClick={() => onClickRow?.(cell, row)}
                          key={cell.id}
                          className="text-xs"
                          sx={{
                            paddingTop: 0,
                            paddingBottom: 0,
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </MuiTable>
          </TableContainer>
        </Box>
      </div>
    </>
  )
}

export default Table;
