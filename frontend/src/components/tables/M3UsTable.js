import { useEffect, useMemo, useRef, useState } from "react";
import {
  MaterialReactTable,
  MRT_ShowHideColumnsButton,
  MRT_ToggleFullScreenButton,
  useMaterialReactTable,
} from "material-react-table";
import {
  Box,
  Grid2,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Checkbox,
  Select,
  MenuItem,
} from "@mui/material";
import API from "../../api";
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  SwapVert as SwapVertIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import usePlaylistsStore from "../../store/playlists";
import M3UForm from "../forms/M3U";
import { TableHelper } from "../../helpers";

const Example = () => {
  const [playlist, setPlaylist] = useState(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [activeFilterValue, setActiveFilterValue] = useState("all");

  const playlists = usePlaylistsStore((state) => state.playlists);

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: "Name",
        accessorKey: "name",
      },
      {
        header: "URL / File",
        accessorKey: "server_url",
      },
      {
        header: "Max Streams",
        accessorKey: "max_streams",
        size: 200,
      },
      {
        header: "Active",
        accessorKey: "is_active",
        size: 100,
        sortingFn: "basic",
        muiTableBodyCellProps: {
          align: "left",
        },
        Cell: ({ cell }) => (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
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
          if (!activeFilterValue) return true; // Show all if no filter
          return String(row.getValue("is_active")) === activeFilterValue;
        },
      },
    ],
    [],
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editPlaylist = async (playlist = null) => {
    setPlaylist(playlist);
    setPlaylistModalOpen(true);
  };

  const refreshPlaylist = async (id) => {
    await API.refreshPlaylist(id);
  };

  const deletePlaylist = async (id) => {
    await API.deletePlaylist(id);
  };

  const deletePlaylists = async (ids) => {
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    // await API.deleteStreams(selected.map(stream => stream.original.id))
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
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
    data: playlists,
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
      density: "compact",
    },
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small" // Makes the button smaller
          color="warning" // Red color for delete actions
          onClick={() => {
            editPlaylist(row.original);
          }}
        >
          <EditIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
        <IconButton
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => deletePlaylist(row.original.id)}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
        <IconButton
          size="small" // Makes the button smaller
          color="info" // Red color for delete actions
          variant="contained"
          onClick={() => refreshPlaylist(row.original.id)}
        >
          <RefreshIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
      </>
    ),
    muiTableContainerProps: {
      sx: {
        height: "calc(42vh - 0px)",
      },
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
        }}
      >
        <Typography>M3U Accounts</Typography>
        <Tooltip title="Add New M3U Account">
          <IconButton
            size="small" // Makes the button smaller
            color="success" // Red color for delete actions
            variant="contained"
            onClick={() => editPlaylist()}
          >
            <AddIcon fontSize="small" /> {/* Small icon size */}
          </IconButton>
        </Tooltip>
      </Stack>
    ),
  });

  return (
    <Box
      sx={{
        padding: 2,
      }}
    >
      <MaterialReactTable table={table} />
      <M3UForm
        playlist={playlist}
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
      />
    </Box>
  );
};

export default Example;
