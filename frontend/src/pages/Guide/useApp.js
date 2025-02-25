import React from "react";

import { useEpg } from "planby";

// Import theme
import { theme } from "./theme";
import API from "../../api";
import { Description } from "@mui/icons-material";

const sampleChannel =   {
  uuid: "16fdfefe-e466-4090-bc1a-57c43937f826",
  type: "channel",
  title: "r tv",
  country: "USA",
  provider: 7427,
  logo:
    "https://raw.githubusercontent.com/karolkozer/planby-demo-resources/master/resources/channel-logos/png/r-channel.png",
  year: 2002
}

const fetchChannels = async () => {
  const channels = await API.getChannels()
  const retval = []
  for (const channel of channels) {
    if (!channel.channel_name.includes("Nickelod")) {
      continue
    }
    console.log(channel)
    retval.push({
      ...sampleChannel,
      uuid: "Nickelodeon (East).us",
      type: "channel",
      title: channel.channel_name,
      country: "USA",
      provider: channel.channel_group?.name || "Default",
      logo: channel.logo_url || "/images/logo.png",
      year: 2025,
    })
  }

  return retval;
}

const sample = {
  "id": "6f3caa7f-5b11-4edb-998e-80d4baa03373",
  "description": "Bounty hunter Boba Fett & mercenary Fennec Shand navigate the underworld when they return to Tatooine to claim Jabba the Hutt's old turf.",
  "title": "The Book of Boba Fett",
  "isYesterday": true,
  "since": "2022-10-17T23:50:00",
  "till": "2022-10-18T00:55:00",
  "channelUuid": "16fdfefe-e466-4090-bc1a-57c43937f826",
  "image": "https://www.themoviedb.org/t/p/w1066_and_h600_bestv2/sjx6zjQI2dLGtEL0HGWsnq6UyLU.jpg",
  "country": "Ghana",
  "Year": "2021–",
  "Rated": "TV-14",
  "Released": "29 Dec 2021",
  "Runtime": "N/A",
  "Genre": "Action, Adventure, Sci-Fi",
  "Director": "N/A",
  "Writer": "Jon Favreau",
  "Actors": "Temuera Morrison, Ming-Na Wen, Matt Berry",
  "Language": "English",
  "Country": "United States",
  "Awards": "N/A",
  "Metascore": "N/A",
  "imdbRating": "8.0",
  "imdbVotes": "20,147",
  "imdbID": "tt13668894",
  "Type": "series",
  "totalSeasons": "1",
  "Response": "True",
  "Ratings": [
    {
      "Source": "Internet Movie Database",
      "Value": "8.0/10"
    }
  ],
  "rating": 3
}

const fetchEpg = async () => {
  const programs = await API.getGrid();
  const retval = []
  console.log(programs)
  for (const program of programs.data) {
    retval.push({
      ...sample,
      id: program.id,
      channelUuid: "Nickelodeon (East).us",
      description: program.description,
      title: program.title,
      since: program.start_time.replace('Z', ''),
      till: program.end_time.replace('Z', ''),
    })
  }

  return retval;
}

export function useApp() {
  const [channels, setChannels] = React.useState([]);
  const [epg, setEpg] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const channelsData = React.useMemo(() => channels, [channels]);
  const epgData = React.useMemo(() => epg, [epg]);

  const formatDate = (date) => date.toISOString().split('T')[0] + 'T00:00:00';

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const { getEpgProps, getLayoutProps } = useEpg({
    channels: channelsData,
    epg: epgData,
    dayWidth: 7200,
    sidebarWidth: 100,
    itemHeight: 80,
    isSidebar: true,
    isTimeline: true,
    isLine: true,
    startDate: today,
    endDate: tomorrow,
    isBaseTimeFormat: true,
    theme
  });

  const handleFetchResources = React.useCallback(async () => {
    setIsLoading(true);
    const epg = await fetchEpg();
    const channels = await fetchChannels();
    setEpg(epg);
    setChannels(channels);
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    handleFetchResources();
  }, [handleFetchResources]);

  return { getEpgProps, getLayoutProps, isLoading };
}
