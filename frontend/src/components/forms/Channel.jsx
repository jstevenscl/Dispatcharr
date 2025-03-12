import React, { useState, useEffect, useMemo } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useChannelsStore from '../../store/channels';
import API from '../../api';
import useStreamProfilesStore from '../../store/streamProfiles';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';
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
} from '@mantine/core';
import { SquarePlus } from 'lucide-react';

const Channel = ({ channel = null, isOpen, onClose }) => {
  const channelGroups = useChannelsStore((state) => state.channelGroups);
  const streams = useStreamsStore((state) => state.streams);
  const { profiles: streamProfiles } = useStreamProfilesStore();
  const { playlists } = usePlaylistsStore();

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(logo);
  const [channelStreams, setChannelStreams] = useState([]);
  const [channelGroupModelOpen, setChannelGroupModalOpen] = useState(false);

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

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const formik = useFormik({
    initialValues: {
      channel_name: '',
      channel_number: '',
      channel_group_id: '',
      stream_profile_id: '0',
      tvg_id: '',
      tvg_name: '',
    },
    validationSchema: Yup.object({
      channel_name: Yup.string().required('Name is required'),
      channel_number: Yup.string().required('Invalid channel number').min(0),
      channel_group_id: Yup.string().required('Channel group is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (values.stream_profile_id == '0') {
        values.stream_profile_id = null;
      }

      console.log(values);
      if (channel?.id) {
        await API.updateChannel({
          id: channel.id,
          ...values,
          logo_file: logoFile,
          streams: channelStreams.map((stream) => stream.id),
        });
      } else {
        await API.addChannel({
          ...values,
          logo_file: logoFile,
          streams: channelStreams.map((stream) => stream.id),
        });
      }

      resetForm();
      setLogoFile(null);
      setLogoPreview(logo);
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (channel) {
      formik.setValues({
        channel_name: channel.channel_name,
        channel_number: channel.channel_number,
        channel_group_id: channel.channel_group?.id,
        stream_profile_id: channel.stream_profile_id || '0',
        tvg_id: channel.tvg_id,
        tvg_name: channel.tvg_name,
      });

      console.log(channel);
      setChannelStreams(channel.streams);
    } else {
      formik.resetForm();
    }
  }, [channel]);

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

  return (
    <>
      <Modal opened={isOpen} onClose={onClose} size={800} title="Channel">
        <form onSubmit={formik.handleSubmit}>
          <Grid gap={2}>
            <Grid.Col span={6}>
              <TextInput
                id="channel_name"
                name="channel_name"
                label="Channel Name"
                value={formik.values.channel_name}
                onChange={formik.handleChange}
                error={
                  formik.errors.channel_name ? formik.touched.channel_name : ''
                }
              />

              <Grid>
                <Grid.Col span={11}>
                  <NativeSelect
                    id="channel_group_id"
                    name="channel_group_id"
                    label="Channel Group"
                    value={formik.values.channel_group_id}
                    onChange={formik.handleChange}
                    error={
                      formik.errors.channel_group_id
                        ? formik.touched.channel_group_id
                        : ''
                    }
                    data={channelGroups.map((option, index) => ({
                      value: `${option.id}`,
                      label: option.name,
                    }))}
                  />
                </Grid.Col>
                <Grid.Col span={1}>
                  <ActionIcon
                    color="green.5"
                    onClick={() => setChannelGroupModalOpen(true)}
                    title="Create new group"
                    size="small"
                    variant="light"
                    style={{ marginTop: '175%' }} // @TODO: I don't like this, figure out better placement
                  >
                    <SquarePlus />
                  </ActionIcon>
                </Grid.Col>
              </Grid>

              <NativeSelect
                id="stream_profile_id"
                label="Stream Profile"
                name="stream_profile_id"
                value={formik.values.stream_profile_id}
                onChange={formik.handleChange}
                error={
                  formik.errors.stream_profile_id
                    ? formik.touched.stream_profile_id
                    : ''
                }
                data={streamProfiles.map((option) => ({
                  value: `${option.id}`,
                  label: option.profile_name,
                }))}
              />

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
              />
            </Grid.Col>

            <Grid.Col span={6}>
              <TextInput
                id="tvg_name"
                name="tvg_name"
                label="TVG Name"
                value={formik.values.tvg_name}
                onChange={formik.handleChange}
                error={formik.errors.tvg_name ? formik.touched.tvg_name : ''}
              />

              <TextInput
                id="tvg_id"
                name="tvg_id"
                label="TVG ID"
                value={formik.values.tvg_id}
                onChange={formik.handleChange}
                error={formik.errors.tvg_id ? formik.touched.tvg_id : ''}
              />

              <TextInput
                id="logo_url"
                name="logo_url"
                label="Logo URL (Optional)"
                style={{ marginBottom: 2 }}
                value={formik.values.logo_url}
                onChange={formik.handleChange}
              />

              <Group style={{ paddingTop: 10 }}>
                <Text>Logo</Text>
                {/* Display selected image */}
                <Box>
                  <img
                    src={logoPreview}
                    alt="Selected"
                    style={{ maxWidth: 50, height: 'auto' }}
                  />
                </Box>
                <input
                  type="file"
                  id="logo"
                  name="logo"
                  accept="image/*"
                  onChange={(event) => handleLogoChange(event)}
                  style={{ display: 'none' }}
                />
                <label htmlFor="logo">
                  <Button variant="contained" component="span" size="small">
                    Browse...
                  </Button>
                </label>
              </Group>
            </Grid.Col>
          </Grid>

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
              variant="contained"
              color="primary"
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
