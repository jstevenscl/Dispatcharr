// frontend/src/pages/Guide.js
import React, { useMemo, useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import API from '../api';
import useChannelsStore from '../store/channels';
import logo from '../images/logo.png';
import useVideoStore from '../store/useVideoStore'; // NEW import
import { notifications } from '@mantine/notifications';
import useSettingsStore from '../store/settings';
import {
  Title,
  Box,
  Modal,
  Flex,
  Button,
  Text,
  Paper,
  Grid,
  Group,
} from '@mantine/core';
import './guide.css';

/** Layout constants */
const CHANNEL_WIDTH = 120; // Width of the channel/logo column
const PROGRAM_HEIGHT = 90; // Height of each channel row
const HOUR_WIDTH = 450; // Increased from 300 to 450 to make each program wider
const MINUTE_INCREMENT = 15; // For positioning programs every 15 min
const MINUTE_BLOCK_WIDTH = HOUR_WIDTH / (60 / MINUTE_INCREMENT);

// Modal size constants
const MODAL_WIDTH = 600;
const MODAL_HEIGHT = 400;

export default function TVChannelGuide({ startDate, endDate }) {
  const { channels, recordings } = useChannelsStore();

  const [programs, setPrograms] = useState([]);
  const [guideChannels, setGuideChannels] = useState([]);
  const [now, setNow] = useState(dayjs());
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(true);
  const {
    environment: { env_mode },
  } = useSettingsStore();

  const guideRef = useRef(null);

  // Load program data once
  useEffect(() => {
    if (!Object.keys(channels).length === 0) {
      console.warn('No channels provided or empty channels array');
      notifications.show({ title: 'No channels available', color: 'red.5' });
      setLoading(false);
      return;
    }

    const fetchPrograms = async () => {
      console.log('Fetching program grid...');
      const fetched = await API.getGrid(); // GETs your EPG grid
      console.log(`Received ${fetched.length} programs`);

      // Unique tvg_ids from returned programs
      const programIds = [...new Set(fetched.map((p) => p.tvg_id))];

      // Filter your Redux/Zustand channels by matching tvg_id
      const filteredChannels = Object.values(channels)
        .filter((ch) => programIds.includes(ch.epg_data?.tvg_id))
        // Add sorting by channel_number
        .sort((a, b) => (a.channel_number || Infinity) - (b.channel_number || Infinity));

      console.log(
        `found ${filteredChannels.length} channels with matching tvg_ids`
      );

      setGuideChannels(filteredChannels);
      console.log(fetched);
      setPrograms(fetched);
      setLoading(false);
    };

    fetchPrograms();
  }, [channels]);

  // Use start/end from props or default to "today at midnight" +24h
  const defaultStart = dayjs(startDate || dayjs().startOf('day'));
  const defaultEnd = endDate ? dayjs(endDate) : defaultStart.add(24, 'hour');

  // Expand timeline if needed based on actual earliest/ latest program
  const earliestProgramStart = useMemo(() => {
    if (!programs.length) return defaultStart;
    return programs.reduce((acc, p) => {
      const s = dayjs(p.start_time);
      return s.isBefore(acc) ? s : acc;
    }, defaultStart);
  }, [programs, defaultStart]);

  const latestProgramEnd = useMemo(() => {
    if (!programs.length) return defaultEnd;
    return programs.reduce((acc, p) => {
      const e = dayjs(p.end_time);
      return e.isAfter(acc) ? e : acc;
    }, defaultEnd);
  }, [programs, defaultEnd]);

  const start = earliestProgramStart.isBefore(defaultStart)
    ? earliestProgramStart
    : defaultStart;
  const end = latestProgramEnd.isAfter(defaultEnd)
    ? latestProgramEnd
    : defaultEnd;

  // Time increments in 15-min steps (for placing programs)
  const programTimeline = useMemo(() => {
    const times = [];
    let current = start;
    while (current.isBefore(end)) {
      times.push(current);
      current = current.add(MINUTE_INCREMENT, 'minute');
    }
    return times;
  }, [start, end]);

  // Hourly marks
  const hourTimeline = useMemo(() => {
    const hours = [];
    let current = start;
    while (current.isBefore(end)) {
      hours.push(current);
      current = current.add(1, 'hour');
    }
    return hours;
  }, [start, end]);

  // Scroll to the nearest half-hour mark on load
  useEffect(() => {
    if (guideRef.current) {
      // Round the current time to the nearest half-hour mark
      const roundedNow = now.minute() < 30 ? now.startOf('hour') : now.startOf('hour').add(30, 'minute');
      const nowOffset = roundedNow.diff(start, 'minute');
      const scrollPosition =
        (nowOffset / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH - MINUTE_BLOCK_WIDTH;
      guideRef.current.scrollLeft = Math.max(scrollPosition, 0);
    }
  }, [programs, now, start]);

  // Update “now” every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(dayjs());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Pixel offset for the “now” vertical line
  const nowPosition = useMemo(() => {
    if (now.isBefore(start) || now.isAfter(end)) return -1;
    const minutesSinceStart = now.diff(start, 'minute');
    return (minutesSinceStart / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH;
  }, [now, start, end]);

  // Helper: find channel by tvg_id
  function findChannelByTvgId(tvgId) {
    return guideChannels.find((ch) => ch.epg_data?.tvg_id === tvgId);
  }

  const record = async (program) => {
    const channel = findChannelByTvgId(program.tvg_id);
    await API.createRecording({
      channel: `${channel.id}`,
      start_time: program.start_time,
      end_time: program.end_time,
      custom_properties: JSON.stringify({
        program,
      }),
    });
    notifications.show({ title: 'Recording scheduled' });
  };

  // The “Watch Now” click => show floating video
  const { showVideo } = useVideoStore(); // or useVideoStore()
  function handleWatchStream(program) {
    const matched = findChannelByTvgId(program.tvg_id);
    if (!matched) {
      console.warn(`No channel found for tvg_id=${program.tvg_id}`);
      return;
    }
    // Build a playable stream URL for that channel
    let vidUrl = `/proxy/ts/stream/${matched.uuid}`;
    if (env_mode == 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }

    showVideo(vidUrl);

    // Optionally close the modal
    setSelectedProgram(null);
  }

  // On program click, open the details modal
  function handleProgramClick(program, event) {
    setSelectedProgram(program);
    setRecording(
      recordings.find((recording) => {
        if (recording.custom_properties) {
          const customProps = JSON.parse(recording.custom_properties);
          if (customProps.program && customProps.program.id == program.id) {
            return recording;
          }
        }

        return null;
      })
    );
  }

  // Close the modal
  function handleCloseModal() {
    setSelectedProgram(null);
  }

  // Renders each program block
  function renderProgram(program, channelStart) {
    const programKey = `${program.tvg_id}-${program.start_time}`;
    const programStart = dayjs(program.start_time);
    const programEnd = dayjs(program.end_time);
    const startOffsetMinutes = programStart.diff(channelStart, 'minute');
    const durationMinutes = programEnd.diff(programStart, 'minute');
    const leftPx = (startOffsetMinutes / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH;
    const widthPx = (durationMinutes / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH;
    const recording = recordings.find((recording) => {
      if (recording.custom_properties) {
        const customProps = JSON.parse(recording.custom_properties);
        if (customProps.program && customProps.program.id == program.id) {
          return recording;
        }
      }

      return null;
    });

    // Highlight if currently live
    const isLive = now.isAfter(programStart) && now.isBefore(programEnd);

    // Determine if the program has ended
    const isPast = now.isAfter(programEnd);

    // Calculate how much of the program is cut off
    const cutOffMinutes = Math.max(0, channelStart.diff(programStart, 'minute'));
    const cutOffPx = (cutOffMinutes / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH;

    return (
      <Box
        className="guide-program-container"
        key={programKey}
        style={{
          position: 'absolute',
          left: leftPx,
          top: 0,
          width: widthPx,
          cursor: 'pointer',
        }}
        onClick={(e) => handleProgramClick(program, e)}
      >
        <Paper
          elevation={2}
          className={`guide-program ${isLive ? 'live' : isPast ? 'past' : 'not-live'}`}
          style={{
            width: widthPx - 4,
            height: PROGRAM_HEIGHT - 4,
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px', // Add padding for better readability
            backgroundColor: isLive
              ? '#2d3748' // Default live program color
              : isPast
                ? '#4a5568' // Slightly darker color for past programs
                : '#2c5282', // Default color for upcoming programs
            color: isPast ? '#a0aec0' : '#fff', // Dim text color for past programs
          }}
        >
          <Box>
            <Text
              size="md"
              style={{
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}
            >
              <Group gap="xs">
                {recording && (
                  <div
                    style={{
                      borderRadius: '50%',
                      width: '10px',
                      height: '10px',
                      display: 'flex',
                      backgroundColor: 'red',
                    }}
                  ></div>
                )}
                {program.title}
              </Group>
            </Text>
            <Text
              size="sm"
              style={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}
            >
              {programStart.format('h:mma')} - {programEnd.format('h:mma')}
            </Text>
          </Box>
          {program.description && (
            <Text
              size="xs"
              style={{
                marginTop: '4px',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                color: isPast ? '#718096' : '#cbd5e0', // Dim description for past programs
              }}
            >
              {program.description}
            </Text>
          )}
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      className="tv-guide"
      style={{
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a202c',
        color: '#fff',
        fontFamily: 'Roboto, sans-serif',
      }}
    >
      {/* Sticky top bar */}
      <Flex
        justify="space-between"
        style={{
          backgroundColor: '#2d3748',
          color: '#fff',
          padding: 20,
          position: 'sticky',
          top: 0,
          zIndex: 1000,
        }}
      >
        <Title order={3} style={{ fontWeight: 'bold' }}>
          TV Guide
        </Title>
        <Text>{now.format('dddd, MMMM D, YYYY • h:mm A')}</Text>
      </Flex>

      {/* Guide container with headers and scrollable content */}
      <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
        {/* Main scrollable container that will scroll both headers and content */}
        <Box
          ref={guideRef}
          style={{
            flex: 1,
            overflow: 'auto',
            position: 'relative',
          }}
        >
          {/* Content wrapper with min-width to ensure scroll range */}
          <Box style={{ minWidth: hourTimeline.length * HOUR_WIDTH + CHANNEL_WIDTH, position: 'relative' }}>
            {/* Now line - positioned absolutely within content */}
            {nowPosition >= 0 && (
              <Box
                style={{
                  position: 'absolute',
                  left: nowPosition + CHANNEL_WIDTH,
                  top: 0,
                  height: '100%',
                  width: '2px',
                  backgroundColor: '#38b2ac',
                  zIndex: 15,
                  pointerEvents: 'none', // Allow clicking through the line
                }}
              />
            )}

            {/* Fixed header row - sticky top, scrolls horizontally with content */}
            <Box
              style={{
                display: 'flex',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                backgroundColor: '#171923',
              }}
            >
              {/* Logo header - sticky in both directions */}
              <Box
                style={{
                  width: CHANNEL_WIDTH,
                  minWidth: CHANNEL_WIDTH,
                  flexShrink: 0,
                  height: '40px',
                  backgroundColor: '#2d3748',
                  borderBottom: '1px solid #4a5568',
                  borderRight: '1px solid #4a5568',
                  position: 'sticky',
                  left: 0,
                  zIndex: 200,
                }}
              />

              {/* Timeline header - scrolls horizontally with content */}
              <Box
                style={{
                  flex: 1,
                  display: 'flex',
                  backgroundColor: '#171923',
                  borderBottom: '1px solid #4a5568',
                  overflow: 'hidden',
                }}
              >
                {hourTimeline.map((time, hourIndex) => (
                  <Box
                    key={time.format()}
                    style={{
                      width: HOUR_WIDTH,
                      height: '40px',
                      position: 'relative',
                      color: '#a0aec0',
                      borderRight: '1px solid #4a5568',
                    }}
                  >
                    <Text
                      size="sm"
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: hourIndex === 0 ? 4 : 'calc(50% - 16px)',
                        transform: 'translateY(-50%)',
                      }}
                    >
                      {time.format('h:mma')}
                    </Text>
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        top: 0,
                        width: '100%',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        alignItems: 'end',
                      }}
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <Box
                          key={i}
                          style={{
                            width: '1px',
                            height: '10px',
                            backgroundColor: '#718096',
                            marginRight: i < 3 ? HOUR_WIDTH / 4 - 1 + 'px' : 0,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Channel rows with logos and programs */}
            {guideChannels.map((channel) => {
              const channelPrograms = programs.filter(
                (p) => p.tvg_id === channel.epg_data?.tvg_id
              );
              return (
                <Box
                  key={channel.name}
                  style={{
                    display: 'flex',
                    height: PROGRAM_HEIGHT,
                    borderBottom: '1px solid #4a5568',
                  }}
                >
                  {/* Channel logo - sticky horizontally */}
                  <Box
                    style={{
                      width: CHANNEL_WIDTH,
                      minWidth: CHANNEL_WIDTH,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#2d3748',
                      borderRight: '1px solid #4a5568',
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                    }}
                  >
                    <Flex
                      direction="column"
                      align="center"
                      justify="center"
                      style={{
                        maxWidth: CHANNEL_WIDTH * 0.8,
                        maxHeight: PROGRAM_HEIGHT * 0.9,
                      }}
                    >
                      <img
                        src={channel.logo?.cache_url || logo}
                        alt={channel.name}
                        style={{
                          width: '100%',
                          height: 'auto',
                          objectFit: 'contain',
                          maxHeight: PROGRAM_HEIGHT * 0.65,
                        }}
                      />
                      <Text
                        size="sm"
                        weight={600}
                        style={{
                          marginTop: 4,
                          backgroundColor: '#2d3748', // Changed from '#2C3E50' to match parent background
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: '0.85em',
                          border: '1px solid #4a5568', // Added subtle border for distinction
                        }}
                      >
                        {channel.channel_number || '-'}
                      </Text>
                    </Flex>
                  </Box>

                  {/* Programs for this channel */}
                  <Box style={{ flex: 1, position: 'relative' }}>
                    {channelPrograms.map((prog) => renderProgram(prog, start))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* Modal for program details */}
      <Modal
        title={selectedProgram ? selectedProgram.title : ''}
        opened={Boolean(selectedProgram)}
        onClose={handleCloseModal}
        yOffset="25vh"
      >
        {selectedProgram && (
          <>
            <Text size="sm">
              {dayjs(selectedProgram.start_time).format('h:mma')} -{' '}
              {dayjs(selectedProgram.end_time).format('h:mma')}
            </Text>
            <Text style={{ mt: 2, color: '#fff' }}>
              {selectedProgram.description || 'No description available.'}
            </Text>
            {/* Only show the Watch button if currently live */}
            <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
              {!recording && (
                <Button
                  variant="transparent"
                  color="gray"
                  onClick={() => record(selectedProgram)}
                >
                  Record
                </Button>
              )}

              {now.isAfter(dayjs(selectedProgram.start_time)) &&
                now.isBefore(dayjs(selectedProgram.end_time)) && (
                  <Button
                    variant="transparent"
                    color="gray"
                    onClick={() => handleWatchStream(selectedProgram)}
                  >
                    Watch Now
                  </Button>
                )}
            </Flex>
          </>
        )}
      </Modal>
    </Box>
  );
}
