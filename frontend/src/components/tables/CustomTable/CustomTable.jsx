import { Box, Flex } from '@mantine/core';
import CustomTableHeader from './CustomTableHeader';
import { useCallback, useState } from 'react';
import { flexRender } from '@tanstack/react-table';
import table from '../../../helpers/table';
import CustomTableBody from './CustomTableBody';

const CustomTable = ({ table }) => {
  return (
    <Box
      className="divTable table-striped"
      style={{
        width: '100%',
        height: '100%', // ONLY required when using virtual tables
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CustomTableHeader
        filters={table.filters}
        getHeaderGroups={table.getHeaderGroups}
        allRowIds={table.allRowIds}
        headerCellRenderFns={table.headerCellRenderFns}
        onSelectAllChange={
          table.onSelectAllChange ? table.onSelectAllChange : null
        }
        selectedTableIds={table.selectedTableIds}
      />
      <CustomTableBody
        getRowModel={table.getRowModel}
        bodyCellRenderFns={table.bodyCellRenderFns}
        expandedRowIds={table.expandedRowIds}
        expandedRowRenderer={table.expandedRowRenderer}
        renderBodyCell={table.renderBodyCell}
        getExpandedRowHeight={table.getExpandedRowHeight}
      />
    </Box>
  );
};

export default CustomTable;
