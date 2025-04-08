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
  TextInput,
  Select,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { Search, X, Clock } from 'lucide-react';
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
  const { channels, recordings, channelGroups, profiles } = useChannelsStore();

  const [programs, setPrograms] = useState([]);
  const [guideChannels, setGuideChannels] = useState([]);
  const [filteredChannels, setFilteredChannels] = useState([]);
  const [now, setNow] = useState(dayjs());
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialScrollComplete, setInitialScrollComplete] = useState(false);

  // New filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [selectedProfileId, setSelectedProfileId] = useState('all');

  const {
    environment: { env_mode },
  } = useSettingsStore();

  const guideRef = useRef(null);
  const timelineRef = useRef(null); // New ref for timeline scrolling

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
      setFilteredChannels(filteredChannels); // Initialize filtered channels
      console.log(fetched);
      setPrograms(fetched);
      setLoading(false);
    };

    fetchPrograms();
  }, [channels]);

  // Apply filters when search, group, or profile changes
  useEffect(() => {
    if (!guideChannels.length) return;

    let result = [...guideChannels];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(channel =>
        channel.name.toLowerCase().includes(query)
      );
    }

    // Apply channel group filter
    if (selectedGroupId !== 'all') {
      result = result.filter(channel =>
        channel.channel_group?.id === parseInt(selectedGroupId)
      );
    }

    // Apply profile filter
    if (selectedProfileId !== 'all') {
      // Get the profile's enabled channels
      const profileChannels = profiles[selectedProfileId]?.channels || [];
      const enabledChannelIds = profileChannels
        .filter(pc => pc.enabled)
        .map(pc => pc.id);

      result = result.filter(channel =>
        enabledChannelIds.includes(channel.id)
      );
    }

    setFilteredChannels(result);
  }, [searchQuery, selectedGroupId, selectedProfileId, guideChannels, profiles]);

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

  // Scroll to the nearest half-hour mark ONLY on initial load
  useEffect(() => {
    if (guideRef.current && timelineRef.current && programs.length > 0 && !initialScrollComplete) {
      // Round the current time to the nearest half-hour mark
      const roundedNow = now.minute() < 30 ? now.startOf('hour') : now.startOf('hour').add(30, 'minute');
      const nowOffset = roundedNow.diff(start, 'minute');
      const scrollPosition =
        (nowOffset / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH - MINUTE_BLOCK_WIDTH;

      const scrollPos = Math.max(scrollPosition, 0);
      guideRef.current.scrollLeft = scrollPos;
      timelineRef.current.scrollLeft = scrollPos; // Sync timeline scroll

      // Mark initial scroll as complete
      setInitialScrollComplete(true);
    }
  }, [programs, start, now, initialScrollComplete]);

  // Update “now” every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(dayjs());
    }, 1000);
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

  // Function to scroll to current time - matches initial loading position
  const scrollToNow = () => {
    if (guideRef.current && timelineRef.current && nowPosition >= 0) {
      // Round the current time to the nearest half-hour mark
      const roundedNow = now.minute() < 30 ? now.startOf('hour') : now.startOf('hour').add(30, 'minute');
      const nowOffset = roundedNow.diff(start, 'minute');
      const scrollPosition =
        (nowOffset / MINUTE_INCREMENT) * MINUTE_BLOCK_WIDTH - MINUTE_BLOCK_WIDTH;

      const scrollPos = Math.max(scrollPosition, 0);
      guideRef.current.scrollLeft = scrollPos;
      timelineRef.current.scrollLeft = scrollPos; // Sync timeline scroll
    }
  };

  // Sync scrolling between timeline and main content
  const handleTimelineScroll = () => {
    if (timelineRef.current && guideRef.current) {
      guideRef.current.scrollLeft = timelineRef.current.scrollLeft;
    }
  };

  // Sync scrolling between main content and timeline
  const handleGuideScroll = () => {
    if (guideRef.current && timelineRef.current) {
      timelineRef.current.scrollLeft = guideRef.current.scrollLeft;
    }
  };

  // Handle wheel events on the timeline for horizontal scrolling
  const handleTimelineWheel = (e) => {
    if (timelineRef.current) {
      // Prevent the default vertical scroll
      e.preventDefault();

      // Determine scroll amount (with shift key for faster scrolling)
      const scrollAmount = e.shiftKey ? 250 : 125;

      // Scroll horizontally based on wheel direction
      timelineRef.current.scrollLeft += e.deltaY > 0 ? scrollAmount : -scrollAmount;

      // Sync the main content scroll position
      if (guideRef.current) {
        guideRef.current.scrollLeft = timelineRef.current.scrollLeft;
      }
    }
  };

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

  // Create group options for dropdown
  const groupOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Channel Groups' }];

    if (channelGroups) {
      Object.values(channelGroups).forEach(group => {
        options.push({
          value: group.id.toString(),
          label: group.name
        });
      });
    }

    return options;
  }, [channelGroups]);

  // Create profile options for dropdown
  const profileOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Profiles' }];

    if (profiles) {
      Object.values(profiles).forEach(profile => {
        if (profile.id !== '0') { // Skip the 'All' default profile
          options.push({
            value: profile.id.toString(),
            label: profile.name
          });
        }
      });
    }

    return options;
  }, [profiles]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedGroupId('all');
    setSelectedProfileId('all');
  };

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
        direction="column"
        style={{
          backgroundColor: '#2d3748',
          color: '#fff',
          padding: '12px 20px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
        }}
      >
        {/* Title and current time */}
        <Flex justify="space-between" align="center" mb={12}>
          <Title order={3} style={{ fontWeight: 'bold' }}>
            TV Guide
          </Title>
          <Flex align="center" gap="md">
            <Text>{now.format('dddd, MMMM D, YYYY • h:mm A')}</Text>
            <Tooltip label="Jump to current time">
              <ActionIcon
                onClick={scrollToNow}
                variant="filled"
                size="md"
                radius="xl"
                color="teal"
              >
                <Clock size={16} />
              </ActionIcon>
            </Tooltip>
          </Flex>
        </Flex>

        {/* Filter controls */}
        <Flex gap="md" align="center">
          <TextInput
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '250px' }} // Reduced width from flex: 1
            leftSection={<Search size={16} />}
            rightSection={
              searchQuery ? (
                <ActionIcon onClick={() => setSearchQuery('')} variant="subtle" color="gray" size="sm">
                  <X size={14} />
                </ActionIcon>
              ) : null
            }
          />

          <Select
            placeholder="Filter by group"
            data={groupOptions}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
            style={{ width: '220px' }}
            clearable={false}
          />

          <Select
            placeholder="Filter by profile"
            data={profileOptions}
            value={selectedProfileId}
            onChange={setSelectedProfileId}
            style={{ width: '180px' }}
            clearable={false}
          />

          {(searchQuery !== '' || selectedGroupId !== 'all' || selectedProfileId !== 'all') && (
            <Button variant="subtle" onClick={clearFilters} size="sm" compact>
              Clear Filters
            </Button>
          )}

          <Text size="sm" color="dimmed">
            {filteredChannels.length} {filteredChannels.length === 1 ? 'channel' : 'channels'}
          </Text>
        </Flex>
      </Flex>

      {/* Guide container with headers and scrollable content */}
      <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* Logo header - Sticky, non-scrollable */}
        <Box
          style={{
            display: 'flex',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          {/* Logo header cell - sticky in both directions */}
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

          {/* Timeline header with its own scrollbar */}
          <Box
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Box
              ref={timelineRef}
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                position: 'relative',
              }}
              onScroll={handleTimelineScroll}
              onWheel={handleTimelineWheel} // Add wheel event handler
            >
              <Box
                style={{
                  display: 'flex',
                  backgroundColor: '#171923',
                  borderBottom: '1px solid #4a5568',
                  width: hourTimeline.length * HOUR_WIDTH,
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
          </Box>
        </Box>

        {/* Main scrollable container for program content */}
        <Box
          ref={guideRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden', // Hide horizontal scrollbar here
            position: 'relative',
          }}
          onScroll={handleGuideScroll}
        >
          {/* Content wrapper with min-width to ensure scroll range */}
          <Box style={{
            width: hourTimeline.length * HOUR_WIDTH + CHANNEL_WIDTH,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}>
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

            {/* Channel rows with logos and programs */}
            {filteredChannels.length > 0 ? (
              filteredChannels.map((channel) => {
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
                      {/* Logo content - unchanged */}
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
                            backgroundColor: '#2d3748',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: '0.85em',
                            border: '1px solid #4a5568',
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
              })
            ) : (
              <Box
                style={{
                  padding: '30px',
                  textAlign: 'center',
                  color: '#a0aec0',
                }}
              >
                <Text size="lg">No channels match your filters</Text>
                <Button variant="subtle" onClick={clearFilters} mt={10}>
                  Clear Filters
                </Button>
              </Box>
            )}
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

