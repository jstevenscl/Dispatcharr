import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MaterialReactTable,
  MRT_ShowHideColumnsButton,
  MRT_ToggleFullScreenButton,
  useMaterialReactTable,
} from 'material-react-table';
import { Box, Grid2, Stack, Typography, IconButton, Tooltip, Checkbox, Select, MenuItem } from '@mui/material';
import API from '../../api'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  SwapVert as SwapVertIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import useEPGsStore from '../../store/epgs';
import StreamProfileForm from '../forms/StreamProfile'
import useStreamProfilesStore from '../../store/streamProfiles';

const StreamProfiles = () => {
  const [profile, setProfile] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([])
  const [snackbarMessage, setSnackbarMessage] = useState("")
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [activeFilterValue, setActiveFilterValue] = useState('all');

  const streamProfiles = useStreamProfilesStore(state => state.profiles)

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: 'Name',
        accessorKey: 'profile_name',
      },
      {
        header: 'Command',
        accessorKey: 'command',
      },
      {
        header: 'Parameters',
        accessorKey: 'parameters',
      },
      {
        header: 'Active',
        accessorKey: 'is_active',
        size: 100,
        sortingFn: 'basic',
        muiTableBodyCellProps: {
          align: 'left',
        },
        Cell: ({ cell }) => (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            {cell.getValue() ? <CheckIcon color="success" /> : <CloseIcon color="error" />}
          </Box>
        ),
        Filter: ({ column }) => (
          <Box>
            <Select
              size="small"
              variant="standard"
              value={activeFilterValue}
              onChange={(e) => {
                setActiveFilterValue(e.target.value);
                column.setFilterValue(e.target.value);
              }}
              displayEmpty
              fullWidth
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </Select>
          </Box>
        ),
        filterFn: (row, _columnId, filterValue) => {
          if (filterValue == "all") return true; // Show all if no filter
          return String(row.getValue('is_active')) === filterValue;
        },
      },
    ],
    [],
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editStreamProfile = async (profile = null) => {
    setProfile(profile)
    setProfileModalOpen(true)
  }

  const deleteStreamProfile = async (ids) => {
    await API.deleteStreamProfile(ids)
  }

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

  const table = useMaterialReactTable({
    columns,
    data: streamProfiles,
    enableBottomToolbar: false,
    // enableGlobalFilterModes: true,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    // enableRowNumbers: true,
    enableRowVirtualization: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading,
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
      <>
        <IconButton
          size="small" // Makes the button smaller
          color="warning" // Red color for delete actions
          onClick={() => editStreamProfile(row.original)}
        >
          <EditIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
        <IconButton
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => deleteStreamProfile(row.original.id)}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
      </>
    ),
    positionActionsColumn: 'last',
    muiTableContainerProps: {
      sx: {
        // height: "calc(42vh - 0px)",
      },
    },
    renderTopToolbar: ({ table }) => (
      <Grid2 container direction="row" spacing={3} sx={{
        justifyContent: "left",
        alignItems: "center",
        // height: 30,
        ml: 2,
      }}>
        <Typography>Stream Profiles</Typography>
        <Tooltip title="Add New Stream Profile">
          <IconButton
            size="small" // Makes the button smaller
            color="success" // Red color for delete actions
            variant="contained"
            onClick={() => editStreamProfile()}
          >
            <AddIcon fontSize="small" /> {/* Small icon size */}
          </IconButton>
        </Tooltip>
        <MRT_ShowHideColumnsButton table={table} />
        {/* <MRT_ToggleFullScreenButton table={table} /> */}
      </Grid2>
    ),
  });

  return (
    <>
      <Box sx={{
        padding: 2,
      }}>
        <MaterialReactTable table={table} />
      </Box>

      <StreamProfileForm
        profile={profile}
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </>
  );
};

export default StreamProfiles;
