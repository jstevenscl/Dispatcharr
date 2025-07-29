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
  Badge,
  Group,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
  useDraggable,
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
import useAuthStore from '../../store/auth';
import { USER_LEVELS } from '../../constants';

const RowDragHandleCell = ({ rowId }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: rowId,
  });

  return (
    <Center>
      <ActionIcon
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        variant="transparent"
        size="xs"
        style={{
          cursor: 'grab', // this is enough
        }}
      >
        <GripHorizontal color="white" />
      </ActionIcon>
    </Center>
  );
};

// Row Component
const DraggableRow = ({ row, index }) => {
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
      className={`tr ${index % 2 == 0 ? 'tr-even' : 'tr-odd'}`}
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
              <Text component="div" size="xs">
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
  const playlists = usePlaylistsStore((s) => s.playlists);
  const authUser = useAuthStore((s) => s.user);

  const [data, setData] = useState(channelStreams || []);

  useEffect(() => {
    setData(channelStreams);
  }, [channelStreams]);

  const dataIds = data?.map(({ id }) => id);

  const removeStream = async (stream) => {
    const newStreamList = data.filter((s) => s.id !== stream.id);
    await API.updateChannel({
      ...channel,
      streams: newStreamList.map((s) => s.id),
    });
    await API.requeryChannels();
  };

  // Create M3U account map for quick lookup
  const m3uAccountsMap = useMemo(() => {
    const map = {};
    if (playlists && Array.isArray(playlists)) {
      playlists.forEach((account) => {
        if (account.id) {
          map[account.id] = account.name;
        }
      });
    }
    return map;
  }, [playlists]);

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
          header: 'Stream Info',
          accessorKey: 'name',
          cell: ({ row }) => {
            const stream = row.original;
            const playlistName = playlists[stream.m3u_account]?.name || 'Unknown';
            const accountName = m3uAccountsMap[stream.m3u_account] || playlistName;

            return (
              <Box>
                <Text fw={500} size="sm">{stream.name}</Text>
                <Group gap="xs" mt={2}>
                  <Badge size="xs" variant="light" color="teal">
                    {accountName}
                  </Badge>
                  {stream.quality && (
                    <Badge size="xs" variant="light" color="gray">
                      {stream.quality}
                    </Badge>
                  )}
                  {stream.url && (
                    <Tooltip label={stream.url}>
                      <Badge
                        size="xs"
                        variant="light"
                        color="indigo"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(stream.url);
                          notifications.show({
                            title: 'URL Copied',
                            message: 'Stream URL copied to clipboard',
                            color: 'green',
                          });
                        }}
                      >
                        URL
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
                {stream.stream_stats && (
                  <Group gap="xs" mt={4} align="center">
                    {/* Video Information */}
                    {(stream.stream_stats.video_codec || stream.stream_stats.resolution || stream.stream_stats.video_bitrate || stream.stream_stats.source_fps) && (
                      <>
                        <Text size="xs" c="dimmed" fw={500}>Video:</Text>
                        {stream.stream_stats.resolution && (
                          <Badge size="xs" variant="light" color="red">
                            {stream.stream_stats.resolution}
                          </Badge>
                        )}
                        {stream.stream_stats.video_bitrate && (
                          <Badge size="xs" variant="light" color="orange" style={{ textTransform: 'none' }}>
                            {stream.stream_stats.video_bitrate} KbPS
                          </Badge>
                        )}
                        {stream.stream_stats.source_fps && (
                          <Badge size="xs" variant="light" color="orange">
                            {stream.stream_stats.source_fps} FPS
                          </Badge>
                        )}
                        {stream.stream_stats.video_codec && (
                          <Badge size="xs" variant="light" color="blue">
                            {stream.stream_stats.video_codec.toUpperCase()}
                          </Badge>
                        )}
                      </>
                    )}

                    {/* Audio Information */}
                    {(stream.stream_stats.audio_codec || stream.stream_stats.audio_channels || stream.stream_stats.audio_bitrate) && (
                      <>
                        <Text size="xs" c="dimmed" fw={500}>Audio:</Text>
                        {stream.stream_stats.audio_channels && (
                          <Badge size="xs" variant="light" color="pink">
                            {stream.stream_stats.audio_channels}
                          </Badge>
                        )}
                        {stream.stream_stats.audio_codec && (
                          <Badge size="xs" variant="light" color="pink">
                            {stream.stream_stats.audio_codec.toUpperCase()}
                          </Badge>
                        )}
                        {stream.stream_stats.audio_bitrate && (
                          <Badge size="xs" variant="light" color="violet" style={{ textTransform: 'none' }}>
                            {stream.stream_stats.audio_bitrate} KbPS
                          </Badge>
                        )}
                      </>
                    )}

                    {/* Output Bitrate */}
                    {(stream.stream_stats.ffmpeg_output_bitrate) && (
                      <>
                        <Text size="xs" c="dimmed" fw={500}>Output Bitrate:</Text>
                        {stream.stream_stats.ffmpeg_output_bitrate && (
                          <Badge size="xs" variant="light" color="orange" style={{ textTransform: 'none' }}>
                            {stream.stream_stats.ffmpeg_output_bitrate} KbPS
                          </Badge>
                        )}
                      </>
                    )}
                  </Group>
                )}
              </Box>
            );
          },
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
                  disabled={authUser.user_level != USER_LEVELS.ADMIN}
                />
              </ActionIcon>
            </Center>
          ),
        },
      ],
      [data, playlists, m3uAccountsMap]
    ),
    data,
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
  });

  const handleDragEnd = (event) => {
    if (authUser.user_level != USER_LEVELS.ADMIN) {
      return;
    }

    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id);
        const newIndex = dataIds.indexOf(over.id);
        const retval = arrayMove(data, oldIndex, newIndex);

        const { streams: _, ...channelUpdate } = channel;
        API.updateChannel({
          ...channelUpdate,
          streams: retval.map((row) => row.id),
        }).then(() => {
          API.requeryChannels();
        });

        return retval; //this is just a splice util
      });
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  if (!isExpanded) {
    return <></>;
  }

  const rows = table.getRowModel().rows;

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
              {rows.length === 0 && (
                <Box
                  className="tr"
                  style={{
                    display: 'flex',
                    width: '100%',
                  }}
                >
                  <Box
                    className="td"
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                    }}
                  >
                    <Flex
                      align="center"
                      justify="center"
                      style={{ height: '100%' }}
                    >
                      <Text size="xs">No Data</Text>
                    </Flex>
                  </Box>
                </Box>
              )}
              {rows.length > 0 &&
                table
                  .getRowModel()
                  .rows.map((row) => <DraggableRow key={row.id} row={row} />)}
            </SortableContext>
          </Box>
        </Box>
      </DndContext>
    </Box>
  );
};


export default ChannelStreams;
