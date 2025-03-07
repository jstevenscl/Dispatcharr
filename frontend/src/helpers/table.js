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
        pt: 0,
        pb: 0,
      },
    },
    muiTableHeadCellProps: {
      sx: {
        pt: 0,
        pb: 0,
      },
    },
    muiTableBodyProps: {
      sx: {
        //stripe the rows, make odd rows a darker color
        '& tr:nth-of-type(odd) > td': {
          // backgroundColor: '#f5f5f5',
        },
      },
    },
  },
};
