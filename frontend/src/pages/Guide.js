import React from 'react';
import { useEpg, Epg, Layout } from 'planby';
import API from '../api';

function App() {
  const [channels, setChannels] = React.useState([]);
  const [epg, setEpg] = React.useState([]);

  const fetchChannels = async () => {
    const channels = await API.getChannels();
    const retval = [];
    for (const channel of channels) {
      if (!channel.tvg_id) {
        continue;
      }
      console.log(channel);
      retval.push({
        uuid: channel.tvg_id,
        type: 'channel',
        title: channel.channel_name,
        country: 'USA',
        provider: channel.channel_group?.name || 'Default',
        logo: channel.logo_url || '/images/logo.png',
        year: 2025,
      });
    }

    setChannels(retval);
    return retval;
  };

  const fetchEpg = async () => {
    const programs = await API.getGrid();
    const retval = [];
    console.log(programs);
    for (const program of programs.data) {
      retval.push({
        id: program.id,
        channelUuid: 'Nickelodeon (East).us',
        description: program.description,
        title: program.title,
        since: program.start_time,
        till: program.end_time,
      });
    }

    setEpg(retval);
    return retval;
  };

  const fetchData = async () => {
    const channels = await fetchChannels();
    const epg = await fetchEpg();

    setChannels(channels);
    setEpg(epg);
  };

  if (channels.length === 0) {
    fetchData();
  }

  const formatDate = (date) => date.toISOString().split('T')[0] + 'T00:00:00';

  const today = new Date();
  const tomorrow = new Date(today);

  const {
    getEpgProps,
    getLayoutProps,
    onScrollToNow,
    onScrollLeft,
    onScrollRight,
  } = useEpg({
    epg,
    channels,
    startDate: '2025-02-25T11:00:00', // or 2022-02-02T00:00:00
    width: '100%',
    height: 600,
  });

  return (
    <div>
      <Epg {...getEpgProps()}>
        <Layout {...getLayoutProps()} />
      </Epg>
    </div>
  );
}

export default App;
