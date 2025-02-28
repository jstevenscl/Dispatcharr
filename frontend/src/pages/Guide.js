import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Paper,
  Tooltip,
  Stack,
  FormControl,
  InputLabel,
  Select,
  Input,
  MenuItem,
  Checkbox,
  ListItemText,
} from '@mui/material';
import dayjs from 'dayjs';
import API from '../api';
import useChannelsStore from '../store/channels';
import logo from '../images/logo.png';

const CHANNEL_WIDTH = 100;
const PROGRAM_HEIGHT = 80;
const HOUR_WIDTH = 300;

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      // maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      // width: 250,
    },
  },
};

const TVChannelGuide = ({ startDate, endDate }) => {
  const { channels } = useChannelsStore();

  const [programs, setPrograms] = useState([]);
  const [guideChannels, setGuideChannels] = useState([]);
  const [now, setNow] = useState(dayjs());
  const [activeChannels, setActiveChannels] = useState([]);

  const guideRef = useRef(null);

  if (!channels || channels.length === 0) {
    console.warn('No channels provided or empty channels array');
  }

  const activeChannelChange = (event) => {
    const {
      target: { value },
    } = event;
    setActiveChannels(
      // On autofill we get a stringified value.
      typeof value === 'string' ? value.split(',') : value
    );
  };

  useEffect(() => {
    const fetchPrograms = async () => {
      const programs = await API.getGrid();
      const programIds = [...new Set(programs.map((prog) => prog.tvg_id))];
      const filteredChannels = channels.filter((ch) =>
        programIds.includes(ch.tvg_id)
      );
      setGuideChannels(filteredChannels);
      setActiveChannels(guideChannels.map((channel) => channel.channel_name));
      setPrograms(programs);
    };

    fetchPrograms();
  }, [channels, activeChannels]);

  const latestHalfHour = new Date();

  // Round down the minutes to the nearest half hour
  const minutes = latestHalfHour.getMinutes();
  const roundedMinutes = minutes < 30 ? 0 : 30;

  latestHalfHour.setMinutes(roundedMinutes);
  latestHalfHour.setSeconds(0);
  latestHalfHour.setMilliseconds(0);

  const todayMidnight = dayjs().startOf('day');

  const start = dayjs(startDate || todayMidnight);
  const end = endDate ? dayjs(endDate) : start.add(24, 'hour');

  const timeline = useMemo(() => {
    // console.log('Generating timeline...');
    const hours = [];
    let current = start;
    while (current.isBefore(end)) {
      hours.push(current);
      current = current.add(1, 'hour');
    }
    // console.log('Timeline generated:', hours);
    return hours;
  }, [start, end]);

  useEffect(() => {
    if (guideRef.current) {
      const nowOffset = dayjs().diff(start, 'minute');
      const scrollPosition = (nowOffset / 60) * HOUR_WIDTH - HOUR_WIDTH;
      guideRef.current.scrollLeft = Math.max(scrollPosition, 0);
    }
  }, [programs, start]);

  const renderProgram = (program, channelStart) => {
    const programStart = dayjs(program.start_time);
    const programEnd = dayjs(program.end_time);
    const startOffset = programStart.diff(channelStart, 'minute');
    const duration = programEnd.diff(programStart, 'minute');

    const now = dayjs();
    const isLive =
      dayjs(program.start_time).isBefore(now) &&
      dayjs(program.end_time).isAfter(now);

    return (
      // <Tooltip title={`${program.title} - ${program.description}`} arrow>
      <Box
        sx={{
          position: 'absolute',
          left: (startOffset / 60) * HOUR_WIDTH + 2,
          width: (duration / 60) * HOUR_WIDTH - 4,
          top: 2,
          height: PROGRAM_HEIGHT - 4,
          padding: 1,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          // borderLeft: '1px solid black',
          borderRight: '1px solid black',
          borderRadius: '8px',
          color: 'primary.contrastText',
          background: isLive
            ? 'linear-gradient(to right, #1a202c, #1a202c, #002eb3)'
            : 'linear-gradient(to right, #1a202c, #1a202c)',
          '&:hover': {
            background: 'linear-gradient(to right, #051937, #002360)',
          },
        }}
      >
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontWeight: 'bold',
          }}
        >
          {program.title}
        </Typography>
        <Typography variant="overline" noWrap>
          {programStart.format('h:mma')} - {programEnd.format('h:mma')}
        </Typography>
      </Box>
      // </Tooltip>
    );
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(dayjs());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const nowPosition = useMemo(() => {
    if (now.isBefore(start) || now.isAfter(end)) return -1;
    const totalMinutes = end.diff(start, 'minute');
    const minutesSinceStart = now.diff(start, 'minute');
    return (minutesSinceStart / totalMinutes) * (timeline.length * HOUR_WIDTH);
  }, [now, start, end, timeline.length]);

  return (
    <Box
      sx={{
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        backgroundColor: '#171923',
      }}
    >
      <Box>
        <FormControl sx={{ m: 1, width: 300 }}>
          <InputLabel id="select-channels-label">Channels</InputLabel>
          <Select
            labelId="select-channels-label"
            id="select-channels"
            multiple
            value={activeChannels}
            onChange={activeChannelChange}
            input={<Input label="Channels" />}
            renderValue={(selected) => selected.join(', ')}
            MenuProps={MenuProps}
            size="small"
          >
            {guideChannels.map((channel) => (
              <MenuItem key={channel.channel_name} value={channel.channel_name}>
                <Checkbox
                  checked={activeChannels.includes(channel.channel_name)}
                />
                <ListItemText primary={channel.channel_name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Stack direction="row">
        <Box>
          {/* Channel Column */}
          <Box
            sx={{
              width: CHANNEL_WIDTH,
              height: '40px',
            }}
          />
          {guideChannels
            .filter((channel) => activeChannels.includes(channel.channel_name))
            .map((channel, index) => {
              return (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    // borderTop: '1px solid #ccc',
                    height: PROGRAM_HEIGHT + 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Box
                    sx={{
                      width: CHANNEL_WIDTH,
                      display: 'flex',
                      padding: 1,
                      justifyContent: 'center',
                      maxWidth: CHANNEL_WIDTH * 0.75,
                      maxHeight: PROGRAM_HEIGHT * 0.75,
                    }}
                  >
                    <img
                      src={channel.logo_url || logo}
                      alt={channel.channel_name}
                      style={{
                        width: '100%',
                        height: 'auto',
                        objectFit: 'contain', // This ensures aspect ratio is preserved
                      }}
                    />
                    {/* <Typography variant="body2" sx={{ marginLeft: 1 }}>
                  {channel.channel_name}
                </Typography> */}
                  </Box>
                </Box>
              );
            })}
        </Box>

        {/* Timeline and Lineup */}
        <Box
          ref={guideRef}
          sx={{ overflowY: 'auto', height: '100%', overflowX: 'auto' }}
        >
          <Box
            sx={{
              display: 'flex',
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: '#fff',
            }}
          >
            <Box sx={{ flex: 1, display: 'flex' }}>
              {timeline.map((time, index) => (
                <Box
                  key={time.format()}
                  sx={{
                    width: HOUR_WIDTH,
                    // borderLeft: '1px solid #ddd',
                    padding: 1,
                    backgroundColor: '#171923',
                    color: 'primary.contrastText',
                    height: '40px',
                    alignItems: 'center',
                    position: 'relative',
                    padding: 0,
                  }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{
                      color: '#a0aec0',
                      position: 'absolute',
                      left: index == 0 ? 0 : '-18px',
                    }}
                  >
                    {time.format('h:mma')}
                  </Typography>
                  <Box
                    sx={{
                      height: '100%',
                      width: '100%',
                      display: 'grid',
                      alignItems: 'end',
                      'grid-template-columns': 'repeat(4, 1fr)',
                    }}
                  >
                    <Box
                      sx={{
                        width: '1px',
                        height: '10px',
                        marginRight: HOUR_WIDTH / 4 + 'px',
                        background: '#718096',
                      }}
                    ></Box>
                    <Box
                      sx={{
                        width: '1px',
                        height: '10px',
                        marginRight: HOUR_WIDTH / 4 + 'px',
                        background: '#718096',
                      }}
                    ></Box>
                    <Box
                      sx={{
                        width: '1px',
                        height: '10px',
                        marginRight: HOUR_WIDTH / 4 + 'px',
                        background: '#718096',
                      }}
                    ></Box>
                    <Box
                      sx={{
                        width: '1px',
                        height: '10px',
                        marginRight: HOUR_WIDTH / 4 + 'px',
                        background: '#718096',
                      }}
                    ></Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ position: 'relative' }}>
            {nowPosition > 0 && (
              <Box
                className="now-position"
                sx={{
                  position: 'absolute',
                  left: nowPosition,
                  top: 0,
                  bottom: 0,
                  width: '3px',
                  backgroundColor: 'rgb(44, 122, 123)',
                  zIndex: 15,
                }}
              />
            )}
            {guideChannels
              .filter((channel) =>
                activeChannels.includes(channel.channel_name)
              )
              .map((channel, index) => {
                const channelPrograms = programs.filter(
                  (p) => p.tvg_id === channel.tvg_id
                );
                return (
                  <Box key={index} sx={{ display: 'flex' }}>
                    <Box
                      sx={{
                        flex: 1,
                        position: 'relative',
                        minHeight: PROGRAM_HEIGHT + 1,
                      }}
                    >
                      {channelPrograms.map((program) =>
                        renderProgram(program, start)
                      )}
                    </Box>
                  </Box>
                );
              })}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
};

export default TVChannelGuide;
