import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MaterialReactTable,
  MRT_ShowHideColumnsButton,
  MRT_ToggleFullScreenButton,
  useMaterialReactTable,
} from 'material-react-table';
import {
  Box,
  Grid2,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
} from '@mui/material';
import API from '../../api';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import useUserAgentsStore from '../../store/userAgents';
import UserAgentForm from '../forms/UserAgent';
import { TableHelper } from '../../helpers';

const UserAgentsTable = () => {
  const [userAgent, setUserAgent] = useState(null);
  const [userAgentModalOpen, setUserAgentModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [activeFilterValue, setActiveFilterValue] = useState('all');

  const userAgents = useUserAgentsStore((state) => state.userAgents);

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: 'Name',
        accessorKey: 'user_agent_name',
      },
      {
        header: 'User-Agent',
        accessorKey: 'user_agent',
      },
      {
        header: 'Desecription',
        accessorKey: 'description',
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
        filterFn: (row, _columnId, activeFilterValue) => {
          if (activeFilterValue == 'all') return true; // Show all if no filter
          return String(row.getValue('is_active')) === activeFilterValue;
        },
      },
    ],
    []
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editUserAgent = async (userAgent = null) => {
    setUserAgent(userAgent);
    setUserAgentModalOpen(true);
  };

  const deleteUserAgent = async (ids) => {
    if (Array.isArray(ids)) {
      await API.deleteUserAgents(ids);
    } else {
      await API.deleteUserAgent(ids);
    }
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

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: userAgents,
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
        <IconButton
          size="small" // Makes the button smaller
          color="warning" // Red color for delete actions
          onClick={() => {
            editUserAgent(row.original);
          }}
          sx={{ pt: 0, pb: 0 }}
        >
          <EditIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
        <IconButton
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => deleteUserAgent(row.original.id)}
          sx={{ pt: 0, pb: 0 }}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
      </>
    ),
    muiTableContainerProps: {
      sx: {
        height: 'calc(42vh + 5px)',
      },
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
        }}
      >
        <Typography>User-Agents</Typography>
        <Tooltip title="Add New User Agent">
          <IconButton
            size="small" // Makes the button smaller
            color="success" // Red color for delete actions
            variant="contained"
            onClick={() => editUserAgent()}
          >
            <AddIcon fontSize="small" /> {/* Small icon size */}
          </IconButton>
        </Tooltip>
      </Stack>
    ),
  });

  return (
    <>
      <Box
        sx={{
          padding: 1,
        }}
      >
        <MaterialReactTable table={table} />
      </Box>
      <UserAgentForm
        userAgent={userAgent}
        isOpen={userAgentModalOpen}
        onClose={() => setUserAgentModalOpen(false)}
      />
    </>
  );
};

export default UserAgentsTable;
