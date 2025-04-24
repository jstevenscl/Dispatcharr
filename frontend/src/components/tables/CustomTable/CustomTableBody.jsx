import { Box, Flex } from '@mantine/core';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const CustomTableBody = ({
  getRowModel,
  expandedRowIds,
  expandedRowRenderer,
  renderBodyCell,
  getExpandedRowHeight,
}) => {
  const renderExpandedRow = (row) => {
    if (expandedRowRenderer) {
      return expandedRowRenderer({ row });
    }

    return <></>;
  };

  const rows = getRowModel().rows;

  const renderTableBodyContents = () => {
    const virtualized = false;

    if (virtualized) {
      return (
        <Box className="tbody" style={{ flex: 1 }}>
          <AutoSizer disableWidth>
            {({ height }) => {
              const getItemSize = (index) => {
                const row = rows[index];
                const isExpanded = expandedRowIds.includes(row.original.id);
                console.log(isExpanded);

                // Default row height
                let rowHeight = 28;

                if (isExpanded && getExpandedRowHeight) {
                  // If row is expanded, adjust the height to be larger (based on your logic)
                  // You can get this height from your state, or calculate based on number of items in the expanded row
                  rowHeight += getExpandedRowHeight(row); // This function would calculate the expanded row's height
                }

                return rowHeight;
              };

              return (
                <List
                  height={height}
                  itemCount={rows.length}
                  itemSize={getItemSize}
                  width="100%"
                  overscanCount={10}
                >
                  {({ index, style }) => {
                    const row = rows[index];
                    return renderTableBodyRow(row, index, style);
                  }}
                </List>
              );
            }}
          </AutoSizer>
        </Box>
      );
    }

    return (
      <Box className="tbody" style={{ flex: 1 }}>
        {rows.map((row, index) => renderTableBodyRow(row, index))}
      </Box>
    );
  };

  const renderTableBodyRow = (row, index, style = {}) => {
    return (
      <Box style={style}>
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
    );
  };

  return renderTableBodyContents();
};

export default CustomTableBody;
