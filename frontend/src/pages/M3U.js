import React, { useEffect, useState, useMemo, useCallback } from 'react';
import useUserAgentsStore from '../store/userAgents';
import { Box, Checkbox, IconButton, ButtonGroup, Button } from '@mui/material';
import Table from '../components/tables/Table';
import usePlaylistsStore from '../store/playlists';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import API from '../api'
import M3UForm from '../components/forms/M3U'
import UserAgentForm from '../components/forms/UserAgent'

const M3UPage = () => {
  const isLoading = useUserAgentsStore((state) => state.isLoading);
  const error = useUserAgentsStore((state) => state.error);
  const playlists = usePlaylistsStore(state => state.playlists)
  const userAgents = useUserAgentsStore(state => state.userAgents)

  const [playlist, setPlaylist] = useState(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);

  const [userAgent, setUserAgent] = useState(null);
  const [userAgentModalOpen, setUserAgentModalOpen] = useState(false);

  const editUserAgent = async (userAgent = null) => {
    setUserAgent(userAgent)
    setUserAgentModalOpen(true)
  }

  const editPlaylist = async (playlist = null) => {
    setPlaylist(playlist)
    setPlaylistModalOpen(true)
  }

  const deleteUserAgent = async (ids) => {
    if (Array.isArray(ids)) {
      await API.deleteUserAgents(ids)
    } else {
      await API.deleteUserAgent(ids)
    }
  }

  const deletePlaylist = async (id) => {
    await API.deletePlaylist(id)
  }

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <Table
          name="M3U Accounts"
          tableHeight="calc(50vh - 40px)"
          data={playlists}
          addAction={editPlaylist}
          columnDef={[
            {
              id: 'select-col',
              header: ({ table }) => (
                <Checkbox
                  size="small"
                  checked={table.getIsAllRowsSelected()}
                  indeterminate={table.getIsSomeRowsSelected()}
                  onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
                />
              ),
              size: 10,
              cell: ({ row }) => (
                <Checkbox
                  size="small"
                  checked={row.getIsSelected()}
                  disabled={!row.getCanSelect()}
                  onChange={row.getToggleSelectedHandler()}
                />
              ),
            },
            {
              header: 'Name',
              size: 10,
              accessorKey: 'name',
            },
            {
              header: 'URL / File',
              accessorKey: 'server_url',
              size: 50,
            },
            {
              header: 'Max Streams',
              accessorKey: 'max_streams',
            },
            {
              header: 'Active',
              accessorKey: 'is_active',
              cell: ({ row }) => {(
                <Checkbox
                  size="small"
                  checked={row.original.is_active}
                  disabled
                />
              )},
              meta: {
                filterVariant: null,
              },
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: ({ row }) => {
                return (
                  <>
                    <IconButton
                      size="small" // Makes the button smaller
                      color="warning" // Red color for delete actions
                      onClick={() => {
                        editPlaylist(row.original)
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
                  </>
                )
              }
            },
          ]} />
      </Box>

      <Box sx={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <Table
          name="User-Agents"
          tableHeight="calc(50vh - 40px)"
          data={userAgents}
          addAction={editUserAgent}
          columnDef={[
            {
              id: 'select-col',
              header: ({ table }) => (
                <Checkbox
                  size="small"
                  checked={table.getIsAllRowsSelected()}
                  indeterminate={table.getIsSomeRowsSelected()}
                  onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
                />
              ),
              size: 10,
              cell: ({ row }) => (
                <Checkbox
                  size="small"
                  checked={row.getIsSelected()}
                  disabled={!row.getCanSelect()}
                  onChange={row.getToggleSelectedHandler()}
                />
              ),
            },
            {
              header: 'Name',
              size: 10,
              accessorKey: 'user_agent_name',
            },
            {
              header: 'User-Agent',
              accessorKey: 'user_agent',
              size: 50,
            },
            {
              header: 'Desecription',
              accessorKey: 'description',
            },
            {
              header: 'Active',
              accessorKey: 'is_active',
              cell: ({ row }) => {
                <Checkbox
                  size="small"
                  checked={row.original.is_active}
                  disabled
                />
              }
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: ({ row }) => {
                return (
                  <>
                    <IconButton
                      size="small" // Makes the button smaller
                      color="warning" // Red color for delete actions
                      onClick={() => {
                        editUserAgent(row.original)
                      }}
                    >
                      <EditIcon fontSize="small" /> {/* Small icon size */}
                    </IconButton>
                    <IconButton
                      size="small" // Makes the button smaller
                      color="error" // Red color for delete actions
                      onClick={() => deleteUserAgent(row.original.id)}
                    >
                      <DeleteIcon fontSize="small" /> {/* Small icon size */}
                    </IconButton>
                  </>
                )
              }
            },
          ]}
        />
      </Box>

      <M3UForm
        playlist={playlist}
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
      />

      <UserAgentForm
        userAgent={userAgent}
        isOpen={userAgentModalOpen}
        onClose={() => setUserAgentModalOpen(false)}
      />
    </Box>
  )
};

export default M3UPage;
