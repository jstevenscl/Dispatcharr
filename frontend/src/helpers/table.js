export default {
  defaultProperties: {
    enableGlobalFilter: false,
    enableBottomToolbar: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    positionToolbarAlertBanner: 'none',
    columnFilterDisplayMode: 'popover',
    enableRowNumbers: false,
    positionActionsColumn: 'last',
    initialState: {
      density: 'compact',
    },
    muiTableBodyCellProps: {
      sx: {
        padding: 0,
      },
    },
    muiTableHeadCellProps: {
      sx: {
        padding: 0,
      },
    },
    muiTableBodyProps: {
      sx: {
        //stripe the rows, make odd rows a darker color
        '& tr:nth-of-type(odd) > td': {
          backgroundColor: '#f5f5f5',
        },
      },
    },
  },
};
