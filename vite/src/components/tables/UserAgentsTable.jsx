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
import useUserAgentsStore from '../../store/userAgents';
import UserAgentForm from '../forms/UserAgent';
import { TableHelper } from '../../helpers';
import useSettingsStore from '../../store/settings';
import useAlertStore from '../../store/alerts';
import { ActionIcon, Center, Flex, Select, Tooltip, Text } from '@mantine/core';

const UserAgentsTable = () => {
  const [userAgent, setUserAgent] = useState(null);
  const [userAgentModalOpen, setUserAgentModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [activeFilterValue, setActiveFilterValue] = useState('all');

  const userAgents = useUserAgentsStore((state) => state.userAgents);
  const { settings } = useSettingsStore();
  const { showAlert } = useAlertStore();

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
          <Center>
            {cell.getValue() ? (
              <CheckIcon color="success" />
            ) : (
              <CloseIcon color="error" />
            )}
          </Center>
        ),
        Filter: ({ column }) => (
          <Select
            size="small"
            value={activeFilterValue}
            onChange={(e) => {
              setActiveFilterValue(e.target.value);
              column.setFilterValue(e.target.value);
            }}
            displayEmpty
            data={[
              {
                value: 'all',
                label: 'All',
              },
              {
                value: 'active',
                label: 'Active',
              },
              {
                value: 'inactive',
                label: 'Inactive',
              },
            ]}
          />
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
      if (ids.includes(settings['default-user-agent'].value)) {
        showAlert('Cannot delete default user-agent', 'error');
        return;
      }

      await API.deleteUserAgents(ids);
    } else {
      if (ids == settings['default-user-agent'].value) {
        showAlert('Cannot delete default user-agent', 'error');
        return;
      }

      await API.deleteUserAgent(ids);
    }
  };

  const closeUserAgentForm = () => {
    setUserAgent(null);
    setUserAgentModalOpen(false);
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
        <ActionIcon
          variant="transparent"
          size="small" // Makes the button smaller
          color="yellow.5" // Red color for delete actions
          onClick={() => {
            editUserAgent(row.original);
          }}
        >
          <EditIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => deleteUserAgent(row.original.id)}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
      </>
    ),
    muiTableContainerProps: {
      sx: {
        height: 'calc(42vh + 5px)',
      },
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <Flex directino="row">
        <Text>User-Agents</Text>
        <Tooltip label="Add New User Agent">
          <ActionIcon
            variant="transparent"
            size="small" // Makes the button smaller
            color="green.5" // Red color for delete actions
            onClick={() => editUserAgent()}
          >
            <AddIcon fontSize="small" /> {/* Small icon size */}
          </ActionIcon>
        </Tooltip>
      </Flex>
    ),
  });

  return (
    <>
      <MantineReactTable table={table} />
      <UserAgentForm
        userAgent={userAgent}
        isOpen={userAgentModalOpen}
        onClose={closeUserAgentForm}
      />
    </>
  );
};

export default UserAgentsTable;
