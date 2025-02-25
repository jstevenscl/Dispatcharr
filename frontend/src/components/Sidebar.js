import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
} from "@mui/material";
import {
  Tv as TvIcon,
  CalendarMonth as CalendarMonthIcon,
  VideoFile as VideoFileIcon,
  LiveTv as LiveTvIcon,
  PlaylistPlay as PlaylistPlayIcon,
} from "@mui/icons-material";

const items = [
  { text: "Channels", icon: <TvIcon />, route: "/channels" },
  { text: "M3U", icon: <PlaylistPlayIcon />, route: "/m3u" },
  { text: "EPG", icon: <CalendarMonthIcon />, route: "/epg" },
  {
    text: "Stream Profiles",
    icon: <VideoFileIcon />,
    route: "/stream-profiles",
  },
  { text: "TV Guide", icon: <LiveTvIcon />, route: "/guide" },
];

const Sidebar = ({ open }) => {
  const location = useLocation();

  return (
    <List>
      {items.map((item) => (
        <ListItem key={item.text} disablePadding>
          <ListItemButton
            component={Link}
            to={item.route}
            selected={location.pathname == item.route}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            {open && <ListItemText primary={item.text} />}
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
};

export default Sidebar;
