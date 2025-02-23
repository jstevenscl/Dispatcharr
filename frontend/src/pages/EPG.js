import React, { useEffect, useState, useMemo, useCallback } from 'react';
import useUserAgentsStore from '../store/userAgents';
import { Box, Checkbox, IconButton, ButtonGroup, Button, Snackbar } from '@mui/material';
import Table from '../components/tables/Table';
import useEPGsStore from '../store/epgs';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import API from '../api'
import EPGForm from '../components/forms/EPG'
import UserAgentForm from '../components/forms/UserAgent'

const EPGPage = () => {
  const isLoading = useUserAgentsStore((state) => state.isLoading);
  const error = useUserAgentsStore((state) => state.error);
  const epgs = useEPGsStore(state => state.epgs)
  const userAgents = useUserAgentsStore(state => state.userAgents)

  const [epg, setEPG] = useState(null);
  const [epgModalOpen, setEPGModalOpen] = useState(false);

  const [userAgent, setUserAgent] = useState(null);
  const [userAgentModalOpen, setUserAgentModalOpen] = useState(false);

  const [snackbarMessage, setSnackbarMessage] = useState("")
  const [snackbarOpen, setSnackbarOpen] = useState(false)

  const editUserAgent = async (userAgent = null) => {
    setUserAgent(userAgent)
    setUserAgentModalOpen(true)
  }

  const editEPG = async (epg = null) => {
    setEPG(epg)
    setEPGModalOpen(true)
  }

  const deleteUserAgent = async (ids) => {
    if (Array.isArray(ids)) {
      await API.deleteUserAgents(ids)
    } else {
      await API.deleteUserAgent(ids)
    }
  }

  const deleteEPG = async (id) => {
    await API.deleteEPG(id)
  }

  const refreshEPG = async (id) => {
    await API.refreshEPG(id)
    setSnackbarMessage("EPG refresh initiated")
    setSnackbarOpen(true)
  }

  const closeSnackbar = () => {
    setSnackbarOpen(false)
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
          name="EPG Sources"
          tableHeight="calc(50vh - 40px)"
          data={epgs}
          addAction={editEPG}
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
              header: 'Source Type',
              accessorKey: 'source_type',
              size: 50,
            },
            {
              header: 'URL / API Key',
              accessorKey: 'max_streams',
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: ({ row }) => {
                return (
                  <>
                    <IconButton
                      size="small" // Makes the button smaller
                      color="info" // Red color for delete actions
                      onClick={() => editEPG(row.original)}
                    >
                      <EditIcon fontSize="small" /> {/* Small icon size */}
                    </IconButton>
                    <IconButton
                      size="small" // Makes the button smaller
                      color="error" // Red color for delete actions
                      onClick={() => deleteEPG(row.original.id)}
                    >
                      <DeleteIcon fontSize="small" /> {/* Small icon size */}
                    </IconButton>
                    <IconButton
                      size="small" // Makes the button smaller
                      color="info" // Red color for delete actions
                      onClick={() => refreshEPG(row.original.id)}
                    >
                      <RefreshIcon fontSize="small" /> {/* Small icon size */}
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

      <EPGForm
        epg={epg}
        isOpen={epgModalOpen}
        onClose={() => setEPGModalOpen(false)}
      />

      <UserAgentForm
        userAgent={userAgent}
        isOpen={userAgentModalOpen}
        onClose={() => setUserAgentModalOpen(false)}
      />

      <Snackbar
        anchorOrigin={{ vertical: "top", horizontal: "right"}}
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={closeSnackbar}
        message={snackbarMessage}
      />
    </Box>
  )
};

export default EPGPage;
