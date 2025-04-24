import { Center, Checkbox } from '@mantine/core';
import CustomTable from './CustomTable';
import CustomTableHeader from './CustomTableHeader';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const useTable = ({
  allRowIds,
  headerCellRenderFns = {},
  bodyCellRenderFns = {},
  expandedRowRenderer = () => <></>,
  onRowSelectionChange = null,
  getExpandedRowHeight = null,
  ...options
}) => {
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [expandedRowIds, setExpandedRowIds] = useState([]);

  const rowCount = allRowIds.length;

  const table = useReactTable({
    defaultColumn: {
      size: undefined,
      minSize: 0,
    },
    ...options,
    state: {
      data: options.data,
      selectedTableIds,
    },
    getCoreRowModel: options.getCoreRowModel ?? getCoreRowModel(),
  });

  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds]
  );

  const updateSelectedTableIds = (ids) => {
    setSelectedTableIds(ids);
    if (onRowSelectionChange) {
      onRowSelectionChange(ids);
    }
  };

  const rowSelection = useMemo(() => {
    const selection = {};
    table.getRowModel().rows.forEach((row) => {
      if (selectedTableIdsSet.has(row.original.id)) {
        selection[row.id] = true;
      }
    });
    return selection;
  }, [selectedTableIdsSet, table.getRowModel().rows]);

  const onSelectAllChange = async (e) => {
    const selectAll = e.target.checked;
    if (selectAll) {
      updateSelectedTableIds(allRowIds);
    } else {
      updateSelectedTableIds([]);
    }
  };

  const onRowExpansion = (row) => {
    let isExpanded = false;
    setExpandedRowIds((prev) => {
      isExpanded = prev.includes(row.original.id) ? [] : [row.original.id];
      return isExpanded;
    });
    updateSelectedTableIds([row.original.id]);
  };

  const renderBodyCell = ({ row, cell }) => {
    if (bodyCellRenderFns[cell.column.id]) {
      return bodyCellRenderFns[cell.column.id]({ row, cell });
    }

    const isExpanded = expandedRowIds.includes(row.original.id);
    switch (cell.column.id) {
      case 'select':
        return (
          <Center style={{ width: '100%' }}>
            <Checkbox
              size="xs"
              checked={selectedTableIdsSet.has(row.original.id)}
              onChange={(e) => {
                const newSet = new Set(selectedTableIds);
                if (e.target.checked) {
                  newSet.add(row.original.id);
                } else {
                  newSet.delete(row.original.id);
                }
                updateSelectedTableIds([...newSet]);
              }}
            />
          </Center>
        );
      case 'expand':
        return (
          <Center
            style={{ width: '100%', cursor: 'pointer' }}
            onClick={() => {
              onRowExpansion(row);
            }}
          >
            {isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </Center>
        );

      default:
        return flexRender(cell.column.columnDef.cell, cell.getContext());
    }
  };

  // Return both the table instance and your custom methods
  const tableInstance = useMemo(
    () => ({
      ...table,
      ...options,
      selectedTableIds,
      updateSelectedTableIds,
      rowSelection,
      allRowIds,
      onSelectAllChange,
      selectedTableIdsSet,
      expandedRowIds,
      expandedRowRenderer,
      setSelectedTableIds,
    }),
    [selectedTableIdsSet, expandedRowIds, allRowIds]
  );

  return {
    ...tableInstance,
    headerCellRenderFns,
    bodyCellRenderFns,
    renderBodyCell,
    getExpandedRowHeight,
  };
};

export { useTable, CustomTable, CustomTableHeader };
