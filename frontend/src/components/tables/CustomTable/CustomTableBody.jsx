import { Box, Flex } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';

const CustomTableBody = ({
  getRowModel,
  expandedRowIds,
  expandedRowRenderer,
  renderBodyCell,
}) => {
  const renderExpandedRow = (row) => {
    if (expandedRowRenderer) {
      return expandedRowRenderer({ row });
    }

    return <></>;
  };

  const rows = getRowModel().rows;

  return (
    <Box className="tbody">
      {rows.map((row, index) => (
        <Box>
          <Box
            key={`tr-${row.id}`}
            className={`tr ${index % 2 == 0 ? 'tr-even' : 'tr-odd'}`}
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
                  key={`td-${cell.id}`}
                  style={{
                    flex: cell.column.columnDef.size ? '0 0 auto' : '1 1 0',
                    width: cell.column.columnDef.size
                      ? cell.column.getSize()
                      : undefined,
                    minWidth: 0,
                  }}
                >
                  <Flex align="center" style={{ height: '100%' }}>
                    {renderBodyCell({ row, cell })}
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
