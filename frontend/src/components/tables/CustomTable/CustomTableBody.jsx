import { Box, Flex } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';

const CustomTableBody = ({
  getRowModel,
  bodyCellRenderFns,
  expandedRowIds,
  expandedRowRenderer,
}) => {
  const renderExpandedRow = (row) => {
    if (expandedRowRenderer) {
      return expandedRowRenderer({ row });
    }

    return <></>;
  };

  return (
    <Box className="tbody">
      {getRowModel().rows.map((row) => (
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
                    {bodyCellRenderFns[cell.column.id]
                      ? bodyCellRenderFns[cell.column.id](cell)
                      : flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                  </Flex>
                </Box>
              );
            })}
          </Box>
          {expandedRowIds.includes(row.original.id) && renderExpandedRow(row)}
        </Box>
      ))}
    </Box>
  );
};

export default CustomTableBody;
