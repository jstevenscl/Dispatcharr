import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MaterialReactTable,
  useMaterialReactTable,
} from 'material-react-table';
import {
  Box,
  Grid2,
  Stack,
  Typography,
  Tooltip,
  IconButton,
  Button,
  ButtonGroup,
  Snackbar,
  Popover,
  TextField,
} from '@mui/material';
import useChannelsStore from '../../store/channels';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  SwapVert as SwapVertIcon,
  LiveTv as LiveTvIcon,
} from '@mui/icons-material';
import API from '../../api';
import ChannelForm from '../forms/Channel';
import { TableHelper } from '../../helpers';
import utils from '../../utils';
import { ContentCopy } from '@mui/icons-material';
import logo from '../../images/logo.png';

const Example = () => {
  const [channel, setChannel] = useState(null);
  const [channelModelOpen, setChannelModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);

  const [anchorEl, setAnchorEl] = useState(null);
  const [textToCopy, setTextToCopy] = useState('');

  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const { channels, isLoading: channelsLoading } = useChannelsStore();

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: '#',
        size: 50,
        accessorKey: 'channel_number',
      },
      {
        header: 'Name',
        accessorKey: 'channel_name',
      },
      {
        header: 'Group',

        accessorFn: (row) => row.channel_group?.name || '',
      },
      {
        header: 'Logo',
        accessorKey: 'logo_url',
        size: 55,
        Cell: ({ cell }) => (
          <Grid2
            container
            direction="row"
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img src={cell.getValue() || logo} width="20" />
          </Grid2>
        ),
        meta: {
          filterVariant: null,
        },
      },
    ],
    []
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const closeSnackbar = () => {
    setSnackbarOpen(false);
  };

  const editChannel = async (channel = null) => {
    setChannel(channel);
    setChannelModalOpen(true);
  };

  const deleteChannel = async (id) => {
    await API.deleteChannel(id);
  };

  // @TODO: the bulk delete endpoint is currently broken
  const deleteChannels = async () => {
    setIsLoading(true);
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((chan) => () => {
        return deleteChannel(chan.original.id);
      })
    );
    setIsLoading(false);
  };

  const assignChannels = async () => {
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await API.assignChannelNumbers(selected.map((sel) => sel.original.id));

    // @TODO: update the channels that were assigned
  };

  const closeChannelForm = () => {
    setChannel(null);
    setChannelModalOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    //scroll to the top of the table when the sorting changes
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  const closePopover = () => {
    setAnchorEl(null);
    setSnackbarMessage('');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setSnackbarMessage('Copied!');
    } catch (err) {
      setSnackbarMessage('Failed to copy');
    }

    setSnackbarOpen(true);
  };

  const open = Boolean(anchorEl);

  const copyM3UUrl = async (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy('m3u url');
  };

  const copyEPGUrl = async (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy('epg url');
  };

  const copyHDHRUrl = async (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy('hdhr url');
  };

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: channels,
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading: isLoading || channelsLoading,
      sorting,
      rowSelection,
    },
    rowVirtualizerInstanceRef, //optional
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <IconButton
          size="small"
          color="warning"
          onClick={() => {
            editChannel(row.original);
          }}
          sx={{ p: 0 }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          onClick={() => deleteChannel(row.original.id)}
          sx={{ p: 0 }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
        {/* <IconButton
          size="small"
          color="error"
          onClick={() => previewChannel(row.original.id)}
          sx={{ p: 0 }}
        >
          <LiveTvIcon fontSize="small" />
        </IconButton> */}
      </Box>
    ),
    muiTableContainerProps: {
      sx: {
        height: 'calc(100vh - 75px)', // Subtract padding to avoid cutoff
        overflowY: 'auto', // Internal scrolling for the table
      },
    },
    muiSearchTextFieldProps: {
      variant: 'standard',
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
        }}
      >
        <Typography>Channels</Typography>
        <Tooltip title="Add New Channel">
          <IconButton
            size="small"
            color="success"
            variant="contained"
            onClick={() => editChannel()}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete Channels">
          <IconButton
            size="small"
            color="error"
            variant="contained"
            onClick={deleteChannels}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Assign Channels">
          <IconButton
            size="small"
            color="warning"
            variant="contained"
            onClick={assignChannels}
          >
            <SwapVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <ButtonGroup
          sx={{
            marginLeft: 1,
          }}
        >
          <Button variant="contained" size="small" onClick={copyHDHRUrl}>
            HDHR URL
          </Button>
          <Button variant="contained" size="small" onClick={copyM3UUrl}>
            M3U URL
          </Button>
          <Button variant="contained" size="small" onClick={copyEPGUrl}>
            EPG
          </Button>
        </ButtonGroup>
      </Stack>
    ),
  });

  return (
    <Box>
      <MaterialReactTable table={table} />
      <ChannelForm
        channel={channel}
        isOpen={channelModelOpen}
        onClose={closeChannelForm}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center' }}>
          <TextField
            value={textToCopy}
            variant="standard"
            disabled
            size="small"
            sx={{ marginRight: 1 }}
          />
          <IconButton onClick={handleCopy} color="primary">
            <ContentCopy />
          </IconButton>
        </div>
        {/* {copySuccess && <Typography variant="caption" sx={{ paddingLeft: 2 }}>{copySuccess}</Typography>} */}
      </Popover>

      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={closeSnackbar}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default Example;
