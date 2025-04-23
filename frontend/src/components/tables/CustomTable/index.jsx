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
  filters = {},
  sorting = [],
  expandedRowRenderer = () => <></>,
  onRowSelectionChange = null,
  ...options
}) => {
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [expandedRowIds, setExpandedRowIds] = useState([]);

  const rowCount = allRowIds.length;

  const table = useReactTable({
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

  const rows = table.getRowModel().rows;

  const onRowExpansion = (row) => {
    let isExpanded = false;
    setExpandedRowIds((prev) => {
      isExpanded = prev.includes(row.original.id) ? [] : [row.original.id];
      return isExpanded;
    });
    updateSelectedTableIds([row.original.id]);
  };

  const renderHeaderCell = useCallback(
    (header) => {
      if (table.headerCellRenderFns && table.headerCellRenderFns[header.id]) {
        return table.headerCellRenderFns[header.id](header);
      }

      switch (header.id) {
        case 'select':
          return (
            <Center style={{ width: '100%' }}>
              <Checkbox
                size="xs"
                checked={
                  rowCount == 0 ? false : selectedTableIds.length == rowCount
                }
                indeterminate={
                  selectedTableIds.length > 0 &&
                  selectedTableIds.length !== rowCount
                }
                onChange={onSelectAllChange}
              />
            </Center>
          );

        default:
          return flexRender(
            header.column.columnDef.header,
            header.getContext()
          );
      }
    },
    [filters, selectedTableIds, rowCount, onSelectAllChange, sorting]
  );

  const bodyCellRenderFns = {
    select: useCallback(
      ({ row }) => {
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
      },
      [rows, selectedTableIdsSet]
    ),
    expand: useCallback(({ row }) => {
      const isExpanded = expandedRowIds.includes(row.original.id);

      return (
        <Center
          style={{ width: '100%', cursor: 'pointer' }}
          onClick={() => {
            onRowExpansion(row);
          }}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </Center>
      );
    }),
  };

  // Return both the table instance and your custom methods
  const tableInstance = useMemo(
    () => ({
      ...table,
      ...options,
      sorting,
      selectedTableIds,
      updateSelectedTableIds,
      rowSelection,
      allRowIds,
      onSelectAllChange,
      selectedTableIdsSet,
      expandedRowIds,
      expandedRowRenderer,
    }),
    [selectedTableIdsSet, expandedRowIds]
  );

  return {
    ...tableInstance,
    headerCellRenderFns,
    renderHeaderCell,
    bodyCellRenderFns,
  };
};

export { useTable, CustomTable, CustomTableHeader };
