import React, { useMemo, useState, useEffect } from 'react';
import API from '../../api';
import { GripHorizontal, SquareMinus } from 'lucide-react';
import {
  Box,
  ActionIcon,
  Flex,
  Text,
  useMantineTheme,
  Center,
} from '@mantine/core';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import './table.css';
import useChannelsTableStore from '../../store/channelsTable';
import usePlaylistsStore from '../../store/playlists';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { shallow } from 'zustand/shallow';

// Cell Component
const RowDragHandleCell = ({ rowId }) => {
  const { attributes, listeners } = useSortable({
    id: rowId,
  });
  return (
    // Alternatively, you could set these attributes on the rows themselves
    <ActionIcon {...attributes} {...listeners} variant="transparent" size="xs">
      <GripHorizontal color="white" />
    </ActionIcon>
  );
};

// Row Component
const DraggableRow = ({ row }) => {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform), //let dnd-kit do its thing
    transition: transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative',
  };
  return (
    <Box
      ref={setNodeRef}
      key={row.id}
      className="tr"
      style={{
        ...style,
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
              <Text size="xs">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Text>
            </Flex>
          </Box>
        );
      })}
    </Box>
  );
};

const ChannelStreams = ({ channel, isExpanded }) => {
  const theme = useMantineTheme();

  const channelStreams = useChannelsTableStore(
    (state) => state.getChannelStreams(channel.id),
    shallow
  );

  useEffect(() => {
    setData(channelStreams);
  }, [channelStreams]);

  const [data, setData] = useState(channelStreams || []);

  const dataIds = data?.map(({ id }) => id);

  const playlists = usePlaylistsStore((s) => s.playlists);

  const removeStream = async (stream) => {
    const newStreamList = channelStreams.filter((s) => s.id !== stream.id);
    await API.updateChannel({
      ...channel,
      stream_ids: newStreamList.map((s) => s.id),
    });
    await API.requeryChannels();
  };

  const table = useReactTable({
    columns: useMemo(
      () => [
        {
          id: 'drag-handle',
          header: 'Move',
          cell: ({ row }) => <RowDragHandleCell rowId={row.id} />,
          size: 30,
        },
        {
          id: 'name',
          header: 'Name',
          accessorKey: 'name',
        },
        {
          id: 'm3u',
          header: 'M3U',
          accessorFn: (row) =>
            playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
        },
        {
          id: 'actions',
          header: '',
          size: 30,
          cell: ({ row }) => (
            <Center>
              <ActionIcon variant="transparent" size="xs">
                <SquareMinus
                  color={theme.tailwind.red[6]}
                  onClick={() => removeStream(row.original)}
                />
              </ActionIcon>
            </Center>
          ),
        },
      ],
      [playlists]
    ),
    data: data,
    state: {
      data,
    },
    defaultColumn: {
      size: undefined,
      minSize: 0,
    },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    // getFilteredRowModel: getFilteredRowModel(),
    // getSortedRowModel: getSortedRowModel(),
    // getPaginationRowModel: getPaginationRowModel(),
  });

  function handleDragEnd(event) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id);
        const newIndex = dataIds.indexOf(over.id);
        const retval = arrayMove(data, oldIndex, newIndex);

        const { streams: _, ...channelUpdate } = channel;
        API.updateChannel({
          ...channelUpdate,
          stream_ids: retval.map((row) => row.id),
        }).then(() => {
          API.requeryChannels();
        });

        return retval; //this is just a splice util
      });
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  if (!isExpanded) {
    return <></>;
  }

  return (
    <Box style={{ width: '100%', padding: 10, backgroundColor: '#163632' }}>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        {' '}
        <Box
          className="divTable table-striped"
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box className="tbody">
            <SortableContext
              items={dataIds}
              strategy={verticalListSortingStrategy}
            >
              {table.getRowModel().rows.map((row) => (
                <DraggableRow key={row.id} row={row} />
              ))}
            </SortableContext>
          </Box>
        </Box>
      </DndContext>
    </Box>
  );
};

export default ChannelStreams;
