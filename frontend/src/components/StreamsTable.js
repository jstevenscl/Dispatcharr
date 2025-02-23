import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  getFilteredRowModel,
} from '@tanstack/react-table'
import useStreamsStore from '../store/streams'
import ChannelForm from './forms/Channel'
import API from '../api'
import { Button, ButtonGroup, Checkbox, Table, TableHead, TableRow, TableCell, TableBody, Box, TextField, IconButton } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import Filter from './tables/Filter';

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

const StreamsTable = () => {
  const sterams = useStreamsStore(state => state.streams)
  const [rowSelection, setRowSelection] = useState({})
  const [isModalOpen, setIsModalOpen] = useState(false); // State to control modal visibility
  const [columnFilters, setColumnFilters] = useState([])

  // Define columns with useMemo, this is a stable object and doesn't change unless explicitly modified
  const columns = useMemo(() => [
    {
      id: 'select-col',
      header: ({ table }) => (
        <Checkbox
          size="small"
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
        />
      ),
      size: 10,
      cell: ({ row }) => (
        <Checkbox
          size="small"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    {
      header: 'Name',
      accessorKey: 'name',
    },
    {
      header: 'Group',
      accessorKey: 'group_name',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        console.log(row)
        return (
          <IconButton
            size="small" // Makes the button smaller
            color="error" // Red color for delete actions
            onClick={() => deleteStream(row.original.id)}
          >
            <DeleteIcon fontSize="small" /> {/* Small icon size */}
          </IconButton>
        )
      }
    },
  ], []);

  const table = useReactTable({
    data: streams,
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

  const deleteStream = async (id) => {
    // await API.deleteChannel(id)
  }

  const parentRef = React.useRef(null)

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 20,
  })

  return (
    <div ref={parentRef}>
      {/* Fixed header */}
      <div style={styles.fixedHeader}>
        <ButtonGroup size="small">
          <Button size="small" onClick={() => setIsModalOpen(true)} variant="contained">Add Channel</Button>
        </ButtonGroup>
        {/* Add more buttons as needed */}
      </div>
      <Box sx={{ height: '500px', overflow: 'auto' }} ref={parentRef}>
        <Table stickyHeader style={{ width: '100%' }} size="">
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
                  transform: `translateY(${virtualRow.start}px)`,
                  backgroundColor: index % 2 === 0 ? 'grey.100' : 'white',
                  '&:hover': {
                    backgroundColor: 'grey.200',
                  },
                }}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      // onClick={() => onClickRow?.(cell, row)}
                      key={cell.id}
                      className="text-xs font-graphik"
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
        </Table>
      </Box>

      <ChannelForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}

export default StreamsTable;
