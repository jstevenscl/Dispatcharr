// frontend/src/helpers/table.js

export default {
  defaultProperties: {
    enableBottomToolbar: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    positionToolbarAlertBanner: 'none',
    enableRowNumbers: false,
    positionActionsColumn: 'last',
    enableColumnActions: false,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    initialState: {
      density: 'compact',
    },
    mantinePaperProps: {
      style: {
        '--mrt-selected-row-background-color': '#163632',
        '--mrt-base-background-color': '#27272A',
      },
    },
    mantineSelectAllCheckboxProps: {
      size: 'xs',
    },
    mantineSelectCheckboxProps: {
      size: 'xs',
    },
    mantineTableBodyRowProps: ({ isDetailPanel, row }) => {
      return {
        style: {
          ...(isDetailPanel && {
            border: 'none',
          }),
          ...(isDetailPanel &&
            row.getIsSelected() && {
              backgroundColor: '#163632',
            }),
        },
      };
    },
    mantineTableBodyCellProps: {
      style: {
        // py: 0,
        paddingLeft: 10,
        paddingRight: 10,
        borderColor: '#444',
        color: '#E0E0E0',
        fontSize: '0.85rem',
      },
    },
    mantineTableHeadCellProps: {
      style: {
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 2,
        paddingBottom: 2,
        fontWeight: 'normal',
        color: '#CFCFCF',
        backgroundColor: '#383A3F',
        borderColor: '#444',
        // fontWeight: 600,
        // fontSize: '0.8rem',
      },
    },
    mantineTableBodyProps: {
      style: {
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
