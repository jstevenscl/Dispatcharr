import { Box, Flex } from '@mantine/core';
import CustomTableHeader from './CustomTableHeader';
import { useCallback, useState } from 'react';
import { flexRender } from '@tanstack/react-table';

const CustomTable = ({
  table,
  headerCellRenderer,
  rowDetailRenderer,
  bodyCellRenderFns,
  rowCount,
}) => {
  const [expandedRowId, setExpandedRowId] = useState(null);

  const rows = table.getRowModel().rows;

  const ChannelExpandCell = useCallback(
    ({ row }) => {
      const isExpanded = expandedRowId === row.original.id;

      return (
        <Center
          style={{ width: '100%', cursor: 'pointer' }}
          onClick={() => {
            setExpandedRowId((prev) =>
              prev === row.original.id ? null : row.original.id
            );
          }}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </Center>
      );
    },
    [expandedRowId]
  );

  const ChannelRowSelectCell = useCallback(
    ({ row }) => {
      return (
        <Center style={{ width: '100%' }}>
          <Checkbox
            size="xs"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        </Center>
      );
    },
    [rows]
  );

  const bodyCellRenderer = (cell) => {
    if (bodyCellRenderFns[cell.column.id]) {
      return bodyCellRenderFns(cell);
    }

    switch (cell.column.id) {
      case 'select':
        return ChannelRowSelectCell({ row: cell.row });

      case 'expand':
        return ChannelExpandCell({ row: cell.row });

      default:
        return flexRender(cell.column.columnDef.cell, cell.getContext());
    }
  };

  return (
    <Box
      className="divTable table-striped"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CustomTableHeader
        table={table}
        headerCellRenderer={headerCellRenderer}
        rowCount={rowCount}
        onSelectAllChange={onSelectAllChange}
      />
      <Box className="tbody">
        {table.getRowModel().rows.map((row) => (
          <Box>
            <Box
              key={row.id}
              className="tr"
              style={{
                display: 'flex',
                width: '100%',
                ...(row.getIsSelected() && {
                  backgroundColor: '#163632',
                }),
              }}
            >
              {row.getVisibleCells().map((cell) => {
                return (
                  <Box
                    className="td"
                    key={cell.id}
                    style={{
                      flex: cell.column.columnDef.size ? '0 0 auto' : '1 1 0',
                      width: cell.column.columnDef.size
                        ? cell.column.getSize()
                        : undefined,
                      minWidth: 0,
                    }}
                  >
                    <Flex align="center" style={{ height: '100%' }}>
                      {bodyCellRenderer(cell)}
                    </Flex>
                  </Box>
                );
              })}
            </Box>
            {row.original.id === expandedRowId && (
              <Box
                key={row.id}
                className="tr"
                style={{ display: 'flex', width: '100%' }}
              >
                <ChannelStreams channel={row.original} isExpanded={true} />
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default CustomTable;
