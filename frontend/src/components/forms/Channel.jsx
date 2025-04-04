import React, { useState, useEffect, useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useChannelsStore from '../../store/channels';
import API from '../../api';
import useStreamProfilesStore from '../../store/streamProfiles';
import useStreamsStore from '../../store/streams';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import ChannelGroupForm from './ChannelGroup';
import usePlaylistsStore from '../../store/playlists';
import logo from '../../images/logo.png';
import {
  Box,
  Button,
  Modal,
  TextInput,
  NativeSelect,
  Text,
  Group,
  ActionIcon,
  Center,
  Grid,
  Flex,
  Select,
  Divider,
  Stack,
  useMantineTheme,
  Popover,
  ScrollArea,
  Tooltip,
} from '@mantine/core';
import { ListOrdered, SquarePlus, SquareX, X } from 'lucide-react';
import useEPGsStore from '../../store/epgs';
import { Dropzone } from '@mantine/dropzone';
import { FixedSizeList as List } from 'react-window';

const Channel = ({ channel = null, isOpen, onClose }) => {
  const theme = useMantineTheme();

  const listRef = useRef(null);

  const { channelGroups, logos } = useChannelsStore();
  const streams = useStreamsStore((state) => state.streams);
  const { profiles: streamProfiles } = useStreamProfilesStore();
  const { playlists } = usePlaylistsStore();
  const { epgs, tvgs, tvgsById } = useEPGsStore();

  const [logoPreview, setLogoPreview] = useState(null);
  const [channelStreams, setChannelStreams] = useState([]);
  const [channelGroupModelOpen, setChannelGroupModalOpen] = useState(false);
  const [epgPopoverOpened, setEpgPopoverOpened] = useState(false);
  const [selectedEPG, setSelectedEPG] = useState({});
  const [tvgFilter, setTvgFilter] = useState('');

  const addStream = (stream) => {
    const streamSet = new Set(channelStreams);
    streamSet.add(stream);
    setChannelStreams(Array.from(streamSet));
  };

  const removeStream = (stream) => {
    const streamSet = new Set(channelStreams);
    streamSet.delete(stream);
    setChannelStreams(Array.from(streamSet));
  };

  const handleLogoChange = async (files) => {
    if (files.length === 1) {
      console.log(files[0]);
      const retval = await API.uploadLogo(files[0]);
      setLogoPreview(retval.url);
      formik.setFieldValue('logo_id', retval.id);
    } else {
      setLogoPreview(null);
    }
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      channel_number: '',
      channel_group_id: '',
      stream_profile_id: '0',
      tvg_id: '',
      epg_data_id: '',
      logo_id: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      channel_number: Yup.string().required('Invalid channel number').min(0),
      channel_group_id: Yup.string().required('Channel group is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (values.stream_profile_id == '0') {
        values.stream_profile_id = null;
      }

      if (!values.logo_id || values.logo_id === 'undefined') {
        delete values.logo_id;
      }

      if (channel?.id) {
        await API.updateChannel({
          id: channel.id,
          ...values,
          streams: channelStreams.map((stream) => stream.id),
        });
      } else {
        await API.addChannel({
          ...values,
          streams: channelStreams.map((stream) => stream.id),
        });
      }

      resetForm();
      setLogoPreview(null);
      setSubmitting(false);
      setTvgFilter('');
      onClose();
    },
  });

  useEffect(() => {
    if (channel) {
      if (channel.epg_data) {
        const epgSource = epgs[channel.epg_data.epg_source];
        setSelectedEPG(`${epgSource.id}`);
      }

      formik.setValues({
        name: channel.name,
        channel_number: channel.channel_number,
        channel_group_id: `${channel.channel_group?.id}`,
        stream_profile_id: channel.stream_profile_id
          ? `${channel.stream_profile_id}`
          : '0',
        tvg_id: channel.tvg_id,
        epg_data_id: channel.epg_data ? `${channel.epg_data?.id}` : '',
        logo_id: `${channel.logo?.id}`,
      });

      console.log(channel);
      setChannelStreams(channel.streams);
    } else {
      formik.resetForm();
      setTvgFilter('');
    }
  }, [channel, tvgsById]);

  const renderLogoOption = ({ option, checked }) => {
    return (
      <Center style={{ width: '100%' }}>
        <img src={logos[option.value].url} width="30" />
      </Center>
    );
  };

  // const activeStreamsTable = useMantineReactTable({
  //   data: channelStreams,
  //   columns: useMemo(
  //     () => [
  //       {
  //         header: 'Name',
  //         accessorKey: 'name',
  //         Cell: ({ cell }) => (
  //           <div
  //             style={{
  //               whiteSpace: 'nowrap',
  //               overflow: 'hidden',
  //               textOverflow: 'ellipsis',
  //             }}
  //           >
  //             {cell.getValue()}
  //           </div>
  //         ),
  //       },
  //       {
  //         header: 'M3U',
  //         accessorKey: 'group_name',
  //         Cell: ({ cell }) => (
  //           <div
  //             style={{
  //               whiteSpace: 'nowrap',
  //               overflow: 'hidden',
  //               textOverflow: 'ellipsis',
  //             }}
  //           >
  //             {cell.getValue()}
  //           </div>
  //         ),
  //       },
  //     ],
  //     []
  //   ),
  //   enableSorting: false,
  //   enableBottomToolbar: false,
  //   enableTopToolbar: false,
  //   columnFilterDisplayMode: 'popover',
  //   enablePagination: false,
  //   enableRowVirtualization: true,
  //   enableRowOrdering: true,
  //   rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
  //   initialState: {
  //     density: 'compact',
  //   },
  //   enableRowActions: true,
  //   positionActionsColumn: 'last',
  //   renderRowActions: ({ row }) => (
  //     <>
  //       <IconButton
  //         size="small" // Makes the button smaller
  //         color="error" // Red color for delete actions
  //         onClick={() => removeStream(row.original)}
  //       >
  //         <RemoveIcon fontSize="small" /> {/* Small icon size */}
  //       </IconButton>
  //     </>
  //   ),
  //   mantineTableContainerProps: {
  //     style: {
  //       height: '200px',
  //     },
  //   },
  //   mantineRowDragHandleProps: ({ table }) => ({
  //     onDragEnd: () => {
  //       const { draggingRow, hoveredRow } = table.getState();

  //       if (hoveredRow && draggingRow) {
  //         channelStreams.splice(
  //           hoveredRow.index,
  //           0,
  //           channelStreams.splice(draggingRow.index, 1)[0]
  //         );

  //         setChannelStreams([...channelStreams]);
  //       }
  //     },
  //   }),
  // });

  // const availableStreamsTable = useMantineReactTable({
  //   data: streams,
  //   columns: useMemo(
  //     () => [
  //       {
  //         header: 'Name',
  //         accessorKey: 'name',
  //       },
  //       {
  //         header: 'M3U',
  //         accessorFn: (row) =>
  //           playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
  //       },
  //     ],
  //     []
  //   ),
  //   enableBottomToolbar: false,
  //   enableTopToolbar: false,
  //   columnFilterDisplayMode: 'popover',
  //   enablePagination: false,
  //   enableRowVirtualization: true,
  //   rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
  //   initialState: {
  //     density: 'compact',
  //   },
  //   enableRowActions: true,
  //   renderRowActions: ({ row }) => (
  //     <>
  //       <IconButton
  //         size="small" // Makes the button smaller
  //         color="success" // Red color for delete actions
  //         onClick={() => addStream(row.original)}
  //       >
  //         <AddIcon fontSize="small" /> {/* Small icon size */}
  //       </IconButton>
  //     </>
  //   ),
  //   positionActionsColumn: 'last',
  //   mantineTableContainerProps: {
  //     style: {
  //       height: '200px',
  //     },
  //   },
  // });

  if (!isOpen) {
    return <></>;
  }

  const filteredTvgs = tvgs
    .filter((tvg) => tvg.epg_source == selectedEPG)
    .filter((tvg) => tvg.name.toLowerCase().includes(tvgFilter));

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={onClose}
        size={1000}
        title={
          <Group gap="5">
            <ListOrdered size="20" />
            <Text>Channels</Text>
          </Group>
        }
        styles={{ content: { '--mantine-color-body': '#27272A' } }}
      >
        <form onSubmit={formik.handleSubmit}>
          <Group justify="space-between" align="top">
            <Stack gap="5" style={{ flex: 1 }}>
              <TextInput
                id="name"
                name="name"
                label="Channel Name"
                value={formik.values.name}
                onChange={formik.handleChange}
                error={formik.errors.name ? formik.touched.name : ''}
                size="xs"
              />

              <Flex gap="sm">
                <Select
                  id="channel_group_id"
                  name="channel_group_id"
                  label="Channel Group"
                  value={formik.values.channel_group_id}
                  searchable
                  onChange={(value) => {
                    formik.setFieldValue('channel_group_id', value); // Update Formik's state with the new value
                  }}
                  error={
                    formik.errors.channel_group_id
                      ? formik.touched.channel_group_id
                      : ''
                  }
                  data={Object.values(channelGroups).map((option, index) => ({
                    value: `${option.id}`,
                    label: option.name,
                  }))}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <Flex align="flex-end">
                  <ActionIcon
                    color={theme.tailwind.green[5]}
                    onClick={() => setChannelGroupModalOpen(true)}
                    title="Create new group"
                    size="small"
                    variant="transparent"
                    style={{ marginBottom: 5 }}
                  >
                    <SquarePlus size="20" />
                  </ActionIcon>
                </Flex>
              </Flex>

              <Select
                id="stream_profile_id"
                label="Stream Profile"
                name="stream_profile_id"
                value={formik.values.stream_profile_id}
                onChange={(value) => {
                  formik.setFieldValue('stream_profile_id', value); // Update Formik's state with the new value
                }}
                error={
                  formik.errors.stream_profile_id
                    ? formik.touched.stream_profile_id
                    : ''
                }
                data={[{ value: '0', label: '(use default)' }].concat(
                  streamProfiles.map((option) => ({
                    value: `${option.id}`,
                    label: option.name,
                  }))
                )}
                size="xs"
              />
            </Stack>

            <Divider size="sm" orientation="vertical" />

            <Stack justify="flex-start" style={{ flex: 1 }}>
              <Group justify="space-between">
                <Select
                  id="logo_id"
                  name="logo_id"
                  label="Logo"
                  searchable
                  value={formik.values.logo_id}
                  onChange={(value) => {
                    formik.setFieldValue('logo_id', value);
                  }}
                  error={formik.errors.logo_id ? formik.touched.logo_id : ''}
                  size="xs"
                  data={Object.values(logos).map((logo) => ({
                    label: logo.name,
                    value: `${logo.id}`,
                  }))}
                  renderOption={renderLogoOption}
                  comboboxProps={{ width: 75, position: 'bottom-start' }}
                />
                <img
                  src={
                    logos[formik.values.logo_id]
                      ? logos[formik.values.logo_id].url
                      : logo
                  }
                  height="40"
                />
              </Group>

              <Group>
                <Divider size="xs" style={{ flex: 1 }} />
                <Text size="xs" c="dimmed">
                  OR
                </Text>
                <Divider size="xs" style={{ flex: 1 }} />
              </Group>

              <Stack>
                <Text size="sm">Upload Logo</Text>
                <Dropzone
                  onDrop={handleLogoChange}
                  onReject={(files) => console.log('rejected files', files)}
                  maxSize={5 * 1024 ** 2}
                >
                  <Group
                    justify="center"
                    gap="xl"
                    mih={40}
                    style={{ pointerEvents: 'none' }}
                  >
                    <Text size="sm" inline>
                      Drag images here or click to select files
                    </Text>
                  </Group>
                </Dropzone>

                <Center></Center>
              </Stack>
            </Stack>

            <Divider size="sm" orientation="vertical" />

            <Stack gap="5" style={{ flex: 1 }} justify="flex-start">
              <TextInput
                id="channel_number"
                name="channel_number"
                label="Channel #"
                value={formik.values.channel_number}
                onChange={formik.handleChange}
                error={
                  formik.errors.channel_number
                    ? formik.touched.channel_number
                    : ''
                }
                size="xs"
              />

              <TextInput
                id="tvg_id"
                name="tvg_id"
                label="TVG-ID"
                value={formik.values.tvg_id}
                onChange={formik.handleChange}
                error={formik.errors.tvg_id ? formik.touched.tvg_id : ''}
                size="xs"
              />

              <Popover
                opened={epgPopoverOpened}
                onChange={setEpgPopoverOpened}
                // position="bottom-start"
                withArrow
              >
                <Popover.Target>
                  <TextInput
                    id="epg_data_id"
                    name="epg_data_id"
                    label={
                      <Group style={{ width: '100%' }}>
                        <Box>EPG</Box>
                        <Button size="xs">Use Dummy</Button>
                      </Group>
                    }
                    readOnly
                    value={
                      formik.values.epg_data_id
                        ? tvgsById[formik.values.epg_data_id].name
                        : 'Dummy'
                    }
                    onClick={() => setEpgPopoverOpened(true)}
                    size="xs"
                    rightSection={
                      <Tooltip label="Use dummy EPG">
                        <ActionIcon
                          // color={theme.tailwind.green[5]}
                          color="white"
                          onClick={(e) => {
                            e.stopPropagation();
                            formik.setFieldValue('epg_data_id', null);
                          }}
                          title="Create new group"
                          size="small"
                          variant="transparent"
                        >
                          <X size="20" />
                        </ActionIcon>
                      </Tooltip>
                    }
                  />
                </Popover.Target>

                <Popover.Dropdown onMouseDown={(e) => e.stopPropagation()}>
                  <Group>
                    <Select
                      label="Source"
                      value={selectedEPG}
                      onChange={setSelectedEPG}
                      data={Object.values(epgs).map((epg) => ({
                        value: `${epg.id}`,
                        label: epg.name,
                      }))}
                      size="xs"
                      mb="xs"
                    />

                    {/* Filter Input */}
                    <TextInput
                      label="Filter"
                      value={tvgFilter}
                      onChange={(event) =>
                        setTvgFilter(event.currentTarget.value)
                      }
                      mb="xs"
                      size="xs"
                    />
                  </Group>

                  <ScrollArea style={{ height: 200 }}>
                    <List
                      height={200} // Set max height for visible items
                      itemCount={filteredTvgs.length}
                      itemSize={40} // Adjust row height for each item
                      width="100%"
                      ref={listRef}
                    >
                      {({ index, style }) => (
                        <div style={style}>
                          <Button
                            key={filteredTvgs[index].id}
                            variant="subtle"
                            color="gray"
                            fullWidth
                            justify="left"
                            size="xs"
                            onClick={() => {
                              if (filteredTvgs[index].id == '0') {
                                formik.setFieldValue('epg_data_id', null);
                              } else {
                                formik.setFieldValue(
                                  'epg_data_id',
                                  filteredTvgs[index].id
                                );
                              }
                              setEpgPopoverOpened(false);
                            }}
                          >
                            {filteredTvgs[index].tvg_id}
                          </Button>
                        </div>
                      )}
                    </List>
                  </ScrollArea>
                </Popover.Dropdown>
              </Popover>
            </Stack>
          </Group>

          {/* <Grid gap={2}>
            <Grid.Col span={6}>
              <Typography>Active Streams</Typography>
              <MantineReactTable table={activeStreamsTable} />
            </Grid.Col>

            <Grid.Col span={6}>
              <Typography>Available Streams</Typography>
              <MantineReactTable table={availableStreamsTable} />
            </Grid.Col>
          </Grid> */}

          <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
            <Button
              type="submit"
              variant="default"
              disabled={formik.isSubmitting}
            >
              Submit
            </Button>
          </Flex>
        </form>
      </Modal>

      <ChannelGroupForm
        isOpen={channelGroupModelOpen}
        onClose={() => setChannelGroupModalOpen(false)}
      />
    </>
  );
};

export default Channel;
