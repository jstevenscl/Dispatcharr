// HeadlessChannelsTable.jsx
import React, { useMemo, useState, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  getExpandedRowModel,
} from '@tanstack/react-table';
import {
  Table,
  Box,
  Checkbox,
  ActionIcon,
  ScrollArea,
  Center,
  useMantineTheme,
} from '@mantine/core';
import { ChevronRight, ChevronDown } from 'lucide-react';
import useSettingsStore from '../../../store/settings';
import useChannelsStore from '../../../store/channels';

const ExpandIcon = ({ row, toggle }) => (
  <ActionIcon size="xs" onClick={toggle}>
    {row.getIsExpanded() ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
  </ActionIcon>
);

const ChannelsTableRow = ({ row, virtualRow, index, style, onEdit, onDelete, onPreview, onRecord }) => {
  return (
    <Table.Tr style={{
      ...style,
      position: 'absolute',
      // top: 0,
      display: 'table',
      tableLayout: 'fixed',
      width: '100%',
    }}>
      {row.getVisibleCells().map(cell => {
        return (
          <Table.Td key={cell.id} align={cell.column.columnDef.meta?.align} style={{
            padding: 0,
            width: cell.column.getSize(),
            minWidth: cell.column.columnDef.meta?.minWidth,
            maxWidth: cell.column.columnDef.meta?.maxWidth,
            // maxWidth: cell.column.getSize(),
          }}>
            {flexRender(
              cell.column.columnDef.cell,
              cell.getContext()
            )}
          </Table.Td>
        )
      })}
    </Table.Tr>
  )
};

export default ChannelsTableRow
