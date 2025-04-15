// HeadlessChannelsTable.jsx
import React, { useMemo, useState, useCallback, useRef } from 'react';
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
} from '@mantine/core';
import { ChevronRight, ChevronDown } from 'lucide-react';
import ChannelsTableRow from './ChannelsTableRow';
import { useVirtualizer } from '@tanstack/react-virtual'

const ChannelsTableBody = ({ rows, height, onEdit, onDelete, onPreview, onRecord, virtualizedItems }) => {
  const rowHeight = 48;

  // return (
  //   <tbody>
  //     <AutoSizer disableWidth>
  //       {({ height }) => (
  //         <List
  //           height={height}
  //           itemCount={rows.length}
  //           itemSize={rowHeight}
  //           width="100%"
  //         >
  //           {({ index, style }) => {
  //             const row = rows[index];
  //             return (
  //               <React.Fragment key={row.id}>
  //                 <ChannelsTableRow
  //                   row={row}
  //                   onEdit={onEdit}
  //                   onDelete={onDelete}
  //                   onPreview={onPreview}
  //                   onRecord={onRecord}
  //                 />
  //                 {row.getIsExpanded() && <ChannelsDetailPanel row={row} />}
  //               </React.Fragment>
  //             );
  //           }}
  //         </List>
  //       )}
  //     </AutoSizer>
  //   </tbody>
  // );

  return (
    <Table.Tbody style={{
      position: 'relative',
      // display: 'block',
      height: `${height}px`,
      // overflowY: 'auto',
    }}>
      {virtualizedItems.map((virtualRow, index) => {
        const row = rows[virtualRow.index]
        return (
          <ChannelsTableRow
            row={row}
            virtualRow={virtualRow}
            index={index}
            onEdit={onEdit}
            onDelete={onDelete}
            onPreview={onPreview}
            onRecord={onRecord}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          />
        );
      })}
    </Table.Tbody>
  );
};

export default ChannelsTableBody;
