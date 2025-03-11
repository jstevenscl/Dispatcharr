import { useEffect, useMemo, useRef, useState } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import API from '../../api';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import StreamProfileForm from '../forms/StreamProfile';
import useStreamProfilesStore from '../../store/streamProfiles';
import { TableHelper } from '../../helpers';
import useSettingsStore from '../../store/settings';
import useAlertStore from '../../store/alerts';
import { Box, ActionIcon, Tooltip, Text } from '@mantine/core';

const StreamProfiles = () => {
  const [profile, setProfile] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [activeFilterValue, setActiveFilterValue] = useState('all');

  const streamProfiles = useStreamProfilesStore((state) => state.profiles);
  const { settings } = useSettingsStore();
  const { showAlert } = useAlertStore();

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
            {cell.getValue() ? (
              <CheckIcon color="success" />
            ) : (
              <CloseIcon color="error" />
            )}
          </Box>
        ),
        Filter: ({ column }) => (
          <Box>
            <Select
              size="small"
              value={activeFilterValue}
              onChange={(e) => {
                setActiveFilterValue(e.target.value);
                column.setFilterValue(e.target.value);
              }}
              displayEmpty
              data={['All', 'Active', 'Inactive']}
            />
          </Box>
        ),
        filterFn: (row, _columnId, filterValue) => {
          if (filterValue == 'all') return true;
          return String(row.getValue('is_active')) === filterValue;
        },
      },
    ],
    []
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editStreamProfile = async (profile = null) => {
    setProfile(profile);
    setProfileModalOpen(true);
  };

  const deleteStreamProfile = async (id) => {
    if (id == settings['default-stream-profile'].value) {
      showAlert('Cannot delete default stream-profile', 'error');
      return;
    }

    await API.deleteStreamProfile(id);
  };

  const closeStreamProfileForm = () => {
    setProfile(null);
    setProfileModalOpen(false);
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

  const table = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: streamProfiles,
    enablePagination: false,
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
        <ActionIcon
          variant="transparent"
          color="yellow.5"
          onClick={() => editStreamProfile(row.original)}
        >
          <EditIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size="small"
          color="red.5"
          onClick={() => deleteStreamProfile(row.original.id)}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
      </>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(100vh - 90px)',
        overflowY: 'auto',
      },
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <>
        <Text>Stream Profiles</Text>
        <Tooltip label="Add New Stream Profile">
          <ActionIcon
            variant="transparent"
            size="sm"
            color="green.5"
            onClick={() => editStreamProfile()}
          >
            <AddIcon fontSize="small" /> {/* Small icon size */}
          </ActionIcon>
        </Tooltip>
      </>
    ),
  });

  return (
    <Box
      sx={{
        padding: 1,
      }}
    >
      <MantineReactTable table={table} />

      <StreamProfileForm
        profile={profile}
        isOpen={profileModalOpen}
        onClose={closeStreamProfileForm}
      />
    </Box>
  );
};

export default StreamProfiles;
