import { useEffect, useMemo, useRef, useState } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import API from '../../api';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import useEPGsStore from '../../store/epgs';
import EPGForm from '../forms/EPG';
import { TableHelper } from '../../helpers';
import { ActionIcon, Text, Tooltip, Box } from '@mantine/core';
import useAlertStore from '../../store/alerts';

const EPGsTable = () => {
  const [epg, setEPG] = useState(null);
  const [epgModalOpen, setEPGModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);

  const { showAlert } = useAlertStore();

  const epgs = useEPGsStore((state) => state.epgs);

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
      },
      {
        header: 'Source Type',
        accessorKey: 'source_type',
      },
      {
        header: 'URL / API Key',
        accessorKey: 'max_streams',
      },
    ],
    []
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editEPG = async (epg = null) => {
    setEPG(epg);
    setEPGModalOpen(true);
  };

  const deleteEPG = async (id) => {
    setIsLoading(true);
    await API.deleteEPG(id);
    setIsLoading(false);
  };

  const refreshEPG = async (id) => {
    await API.refreshEPG(id);
    showAlert('EPG refresh initiated');
  };

  const closeEPGForm = () => {
    setEPG(null);
    setEPGModalOpen(false);
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
    data: epgs,
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
          size="sm" // Makes the button smaller
          color="yellow.5" // Red color for delete actions
          onClick={() => editEPG(row.original)}
        >
          <EditIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size="sm" // Makes the button smaller
          color="red.5" // Red color for delete actions
          onClick={() => deleteEPG(row.original.id)}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size="sm" // Makes the button smaller
          // color="blue.5" // Red color for delete actions
          onClick={() => refreshEPG(row.original.id)}
        >
          <RefreshIcon fontSize="small" /> {/* Small icon size */}
        </ActionIcon>
      </>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(40vh - 0px)',
      },
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <>
        <Text>EPGs</Text>
        <Tooltip label="Add New EPG">
          <ActionIcon
            size="small" // Makes the button smaller
            color="success" // Red color for delete actions
            variant="contained"
            onClick={() => editEPG()}
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
      <EPGForm epg={epg} isOpen={epgModalOpen} onClose={closeEPGForm} />
    </Box>
  );
};

export default EPGsTable;
