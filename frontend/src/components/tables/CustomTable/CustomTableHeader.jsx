import { Box, Flex } from '@mantine/core';
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
} from 'lucide-react';
import { useCallback } from 'react';

const CustomTableHeader = ({
  table,
  headerCellRenderFns,
  rowCount,
  onSelectAllChange,
}) => {
  const ChannelRowSelectHeader = useCallback(
    ({ selectedChannelIds }) => {
      return (
        <Center style={{ width: '100%' }}>
          <Checkbox
            size="xs"
            checked={
              rowCount == 0 ? false : selectedChannelIds.length == rowCount
            }
            indeterminate={
              selectedChannelIds.length > 0 &&
              selectedChannelIds.length !== rowCount
            }
            onChange={onSelectAllChange}
          />
        </Center>
      );
    },
    [rows, rowCount]
  );

  const onSelectAll = (e) => {
    if (onSelectAllChange) {
      onSelectAllChange(e);
    }
  };

  const headerCellRenderer = (header) => {
    let sortingIcon = ArrowUpDown;
    if (sorting[0]?.id == header.id) {
      if (sorting[0].desc === false) {
        sortingIcon = ArrowUpNarrowWide;
      } else {
        sortingIcon = ArrowDownWideNarrow;
      }
    }

    switch (header.id) {
      case 'select':
        return ChannelRowSelectHeader({
          selectedChannelIds,
        });

      case 'enabled':
        if (selectedProfileId !== '0' && selectedChannelIds.length > 0) {
          // return EnabledHeaderSwitch();
        }
        return (
          <Center style={{ width: '100%' }}>
            <ScanEye size="16" />
          </Center>
        );

      // case 'channel_number':
      //   return (
      //     <Flex gap={2}>
      //       #
      //       {/* <Center>
      //         {React.createElement(sortingIcon, {
      //           onClick: () => onSortingChange('name'),
      //           size: 14,
      //         })}
      //       </Center> */}
      //     </Flex>
      //   );

      // case 'name':
      //   return (
      //     <Flex gap="sm">
      //       <TextInput
      //         name="name"
      //         placeholder="Name"
      //         value={filters.name || ''}
      //         onClick={(e) => e.stopPropagation()}
      //         onChange={handleFilterChange}
      //         size="xs"
      //         variant="unstyled"
      //         className="table-input-header"
      //       />
      //       <Center>
      //         {React.createElement(sortingIcon, {
      //           onClick: () => onSortingChange('name'),
      //           size: 14,
      //         })}
      //       </Center>
      //     </Flex>
      //   );

      // case 'channel_group':
      //   return (
      //     <MultiSelect
      //       placeholder="Group"
      //       variant="unstyled"
      //       data={groupOptions}
      //       size="xs"
      //       searchable
      //       clearable
      //       onClick={stopPropagation}
      //       onChange={handleGroupChange}
      //       style={{ width: '100%' }}
      //     />
      //   );

      default:
        return flexRender(header.column.columnDef.header, header.getContext());
    }
  };

  return (
    <Box
      className="thead"
      style={{
        position: 'sticky',
        top: 0,
        backgroundColor: '#3E3E45',
        zIndex: 10,
      }}
    >
      {table.getHeaderGroups().map((headerGroup) => (
        <Box
          className="tr"
          key={headerGroup.id}
          style={{ display: 'flex', width: '100%' }}
        >
          {headerGroup.headers.map((header) => {
            return (
              <Box
                className="th"
                key={header.id}
                style={{
                  flex: header.column.columnDef.size ? '0 0 auto' : '1 1 0',
                  width: header.column.columnDef.size
                    ? header.getSize()
                    : undefined,
                  minWidth: 0,
                }}
              >
                <Flex
                  align="center"
                  style={{
                    ...(header.column.columnDef.style &&
                      header.column.columnDef.style),
                    height: '100%',
                  }}
                >
                  {headerCellRenderer(header)}
                </Flex>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

export default CustomTableHeader;
