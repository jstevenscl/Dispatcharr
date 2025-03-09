// frontend/src/helpers/table.js

export default {
  defaultProperties: {
    enableGlobalFilter: false,
    enableBottomToolbar: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    positionToolbarAlertBanner: 'none',
    // columnFilterDisplayMode: 'popover',
    enableRowNumbers: false,
    positionActionsColumn: 'last',
    enableColumnActions: false,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    initialState: {
      density: 'compact',
    },
    muiTableBodyCellProps: {
      sx: {
        py: 0,
        borderColor: '#444',
        color: '#E0E0E0',
        fontSize: '0.85rem',
      },
    },
    muiTableHeadCellProps: {
      sx: {
        py: 0,
        color: '#CFCFCF',
        backgroundColor: '#383A3F',
        borderColor: '#444',
        fontWeight: 600,
        fontSize: '0.8rem',
      },
    },
    muiTableBodyProps: {
      sx: {
        // Subtle row striping
        '& tr:nth-of-type(odd)': {
          backgroundColor: '#2F3034',
        },
        '& tr:nth-of-type(even)': {
          backgroundColor: '#333539',
        },
        // Row hover effect
        '& tr:hover td': {
          backgroundColor: '#3B3D41',
        },
      },
    },
  },
};
