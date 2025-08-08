import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Card,
    Flex,
    Group,
    Image,
    Text,
    Title,
    Select,
    TextInput,
    Pagination,
    Badge,
    Grid,
    Loader,
    Stack,
    SegmentedControl,
    ActionIcon,
    Modal,
    Tabs,
    Table,
    Divider
} from '@mantine/core';
import { Search, Play, Calendar, Clock, Star } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import useVODStore from '../store/useVODStore';
import useVideoStore from '../store/useVideoStore';
import useSettingsStore from '../store/settings';

const imdbUrl = (imdb_id) => imdb_id ? `https://www.imdb.com/title/${imdb_id}` : '';
const tmdbUrl = (tmdb_id, type = 'movie') => tmdb_id ? `https://www.themoviedb.org/${type}/${tmdb_id}` : '';

const VODCard = ({ vod, onClick }) => {
    const isEpisode = vod.type === 'episode';

    const formatDuration = (minutes) => {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const getDisplayTitle = () => {
        if (isEpisode && vod.series) {
            const seasonEp = vod.season_number && vod.episode_number
                ? `S${vod.season_number.toString().padStart(2, '0')}E${vod.episode_number.toString().padStart(2, '0')}`
                : '';
            return (
                <Stack spacing={4}>
                    <Text size="sm" color="dimmed">{vod.series.name}</Text>
                    <Text weight={500}>{seasonEp} - {vod.name}</Text>
                </Stack>
            );
        }
        return <Text weight={500}>{vod.name}</Text>;
    };

    const handleCardClick = async () => {
        // Just pass the basic vod info to the parent handler
        onClick(vod);
    };

    return (
        <Card
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{ cursor: 'pointer', backgroundColor: '#27272A' }}
            onClick={handleCardClick}
        >
            <Card.Section>
                <Box style={{ position: 'relative', height: 300 }}>
                    {vod.logo?.url ? (
                        <Image
                            src={vod.logo.url}
                            height={300}
                            alt={vod.name}
                            fit="contain"
                        />
                    ) : (
                        <Box
                            style={{
                                height: 300,
                                backgroundColor: '#404040',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <Play size={48} color="#666" />
                        </Box>
                    )}

                    <ActionIcon
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            backgroundColor: 'rgba(0,0,0,0.7)'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick(vod);
                        }}
                    >
                        <Play size={16} color="white" />
                    </ActionIcon>

                    <Badge
                        style={{
                            position: 'absolute',
                            bottom: 8,
                            left: 8
                        }}
                        color={isEpisode ? 'blue' : 'green'}
                    >
                        {isEpisode ? 'Episode' : 'Movie'}
                    </Badge>
                </Box>
            </Card.Section>

            <Stack spacing={8} mt="md">
                {getDisplayTitle()}

                <Group spacing={16}>
                    {vod.year && (
                        <Group spacing={4}>
                            <Calendar size={14} color="#666" />
                            <Text size="xs" color="dimmed">{vod.year}</Text>
                        </Group>
                    )}

                    {vod.duration && (
                        <Group spacing={4}>
                            <Clock size={14} color="#666" />
                            <Text size="xs" color="dimmed">{formatDuration(vod.duration)}</Text>
                        </Group>
                    )}

                    {vod.rating && (
                        <Group spacing={4}>
                            <Star size={14} color="#666" />
                            <Text size="xs" color="dimmed">{vod.rating}</Text>
                        </Group>
                    )}
                </Group>

                {vod.genre && (
                    <Text size="xs" color="dimmed" lineClamp={1}>
                        {vod.genre}
                    </Text>
                )}
            </Stack>
        </Card>
    );
};

const SeriesCard = ({ series, onClick }) => {
    return (
        <Card
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{ cursor: 'pointer', backgroundColor: '#27272A' }}
            onClick={() => onClick(series)}
        >
            <Card.Section>
                <Box style={{ position: 'relative', height: 300 }}>
                    {series.logo?.url ? (
                        <Image
                            src={series.logo.url}
                            height={300}
                            alt={series.name}
                            fit="contain"
                        />
                    ) : (
                        <Box
                            style={{
                                height: 300,
                                backgroundColor: '#404040',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <Play size={48} color="#666" />
                        </Box>
                    )}
                    {/* Add Series badge in the same position as Movie badge */}
                    <Badge
                        style={{
                            position: 'absolute',
                            bottom: 8,
                            left: 8
                        }}
                        color="purple"
                    >
                        Series
                    </Badge>
                </Box>
            </Card.Section>

            <Stack spacing={8} mt="md">
                <Text weight={500}>{series.name}</Text>

                <Group spacing={16}>
                    {series.year && (
                        <Group spacing={4}>
                            <Calendar size={14} color="#666" />
                            <Text size="xs" color="dimmed">{series.year}</Text>
                        </Group>
                    )}
                    {series.rating && (
                        <Group spacing={4}>
                            <Star size={14} color="#666" />
                            <Text size="xs" color="dimmed">{series.rating}</Text>
                        </Group>
                    )}
                </Group>

                {series.genre && (
                    <Text size="xs" color="dimmed" lineClamp={1}>
                        {series.genre}
                    </Text>
                )}
            </Stack>
        </Card>
    );
};

const SeriesModal = ({ series, opened, onClose }) => {
    const { fetchSeriesInfo, loading, episodes } = useVODStore();
    const showVideo = useVideoStore((s) => s.showVideo);
    const env_mode = useSettingsStore((s) => s.environment.env_mode);
    const [detailedSeries, setDetailedSeries] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [activeTab, setActiveTab] = useState(null);
    const [expandedEpisode, setExpandedEpisode] = useState(null);
    const [trailerModalOpened, setTrailerModalOpened] = useState(false);
    const [trailerUrl, setTrailerUrl] = useState('');

    useEffect(() => {
        if (opened && series) {
            // Fetch detailed series info which now includes episodes
            setLoadingDetails(true);
            fetchSeriesInfo(series.id)
                .then((details) => {
                    setDetailedSeries(details);
                    // Check if episodes were fetched
                    if (!details.episodes_fetched) {
                        // Episodes not yet fetched, may need to wait for background fetch
                        console.log('Episodes not yet fetched for series, may load incrementally');
                    }
                })
                .catch((error) => {
                    console.warn('Failed to fetch series details, using basic info:', error);
                    setDetailedSeries(series); // Fallback to basic data
                })
                .finally(() => {
                    setLoadingDetails(false);
                });
        }
    }, [opened, series, fetchSeriesInfo]);

    useEffect(() => {
        if (!opened) {
            setDetailedSeries(null);
            setLoadingDetails(false);
        }
    }, [opened]);

    // Get episodes from the store based on the series ID
    const seriesEpisodes = React.useMemo(() => {
        if (!detailedSeries) return [];

        // First try to get episodes from the fetched data
        if (detailedSeries.episodesList) {
            return detailedSeries.episodesList.sort((a, b) => {
                if (a.season_number !== b.season_number) {
                    return (a.season_number || 0) - (b.season_number || 0);
                }
                return (a.episode_number || 0) - (b.episode_number || 0);
            });
        }

        // Otherwise, filter episodes from the global store
        return Object.values(episodes)
            .filter(episode => episode.series?.id === detailedSeries.id)
            .sort((a, b) => {
                if (a.season_number !== b.season_number) {
                    return (a.season_number || 0) - (b.season_number || 0);
                }
                return (a.episode_number || 0) - (b.episode_number || 0);
            });
    }, [detailedSeries, episodes]);

    // Group episodes by season
    const episodesBySeason = React.useMemo(() => {
        const grouped = {};
        seriesEpisodes.forEach(episode => {
            const season = episode.season_number || 1;
            if (!grouped[season]) {
                grouped[season] = [];
            }
            grouped[season].push(episode);
        });
        return grouped;
    }, [seriesEpisodes]);

    // Get available seasons sorted
    const seasons = React.useMemo(() => {
        return Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);
    }, [episodesBySeason]);

    // Update active tab when seasons change or modal opens
    React.useEffect(() => {
        if (seasons.length > 0) {
            if (!activeTab || !seasons.includes(parseInt(activeTab.replace('season-', '')))) {
                setActiveTab(`season-${seasons[0]}`);
            }
        }
    }, [seasons, activeTab]);

    // Reset tab when modal closes
    React.useEffect(() => {
        if (!opened) {
            setActiveTab(null);
        }
    }, [opened]);

    const handlePlayEpisode = (episode) => {
        let streamUrl = `/proxy/vod/episode/${episode.uuid}`;
        if (env_mode === 'dev') {
            streamUrl = `${window.location.protocol}//${window.location.hostname}:5656${streamUrl}`;
        } else {
            streamUrl = `${window.location.origin}${streamUrl}`;
        }
        showVideo(streamUrl, 'vod', episode);
    };

    const formatDuration = (minutes) => {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const handleEpisodeRowClick = (episode) => {
        setExpandedEpisode(expandedEpisode === episode.id ? null : episode.id);
    };

    // Helper to get embeddable YouTube URL
    const getEmbedUrl = (url) => {
        if (!url) return '';
        // Accepts full YouTube URLs or just IDs
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        const videoId = match ? match[1] : url;
        return `https://www.youtube.com/embed/${videoId}`;
    };

    if (!series) return null;

    // Use detailed data if available, otherwise use basic series data
    const displaySeries = detailedSeries || series;

    return (
        <>
            <Modal
                opened={opened}
                onClose={onClose}
                title={displaySeries.name}
                size="xl"
                centered
            >
                <Box style={{ position: 'relative', minHeight: 400 }}>
                    {/* Backdrop image as background */}
                    {displaySeries.backdrop_path && displaySeries.backdrop_path.length > 0 && (
                        <>
                            <Image
                                src={displaySeries.backdrop_path[0]}
                                alt={`${displaySeries.name} backdrop`}
                                fit="cover"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    zIndex: 0,
                                    borderRadius: 8,
                                    filter: 'blur(2px) brightness(0.5)'
                                }}
                            />
                            {/* Overlay for readability */}
                            <Box
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    background: 'linear-gradient(180deg, rgba(24,24,27,0.85) 60%, rgba(24,24,27,1) 100%)',
                                    zIndex: 1,
                                    borderRadius: 8
                                }}
                            />
                        </>
                    )}

                    {/* Modal content above backdrop */}
                    <Box style={{ position: 'relative', zIndex: 2 }}>
                        <Stack spacing="md">
                            {loadingDetails && (
                                <Group spacing="xs" mb={8}>
                                    <Loader size="xs" />
                                    <Text size="xs" color="dimmed">Loading series details and episodes...</Text>
                                </Group>
                            )}

                            {/* Series poster and basic info */}
                            <Flex gap="md">
                                {(displaySeries.series_image || displaySeries.logo?.url) ? (
                                    <Box style={{ flexShrink: 0 }}>
                                        <Image
                                            src={displaySeries.series_image || displaySeries.logo.url}
                                            width={200}
                                            height={300}
                                            alt={displaySeries.name}
                                            fit="contain"
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Box>
                                ) : (
                                    <Box
                                        style={{
                                            width: 200,
                                            height: 300,
                                            backgroundColor: '#404040',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '8px',
                                            flexShrink: 0
                                        }}
                                    >
                                        <Play size={48} color="#666" />
                                    </Box>
                                )}

                                <Stack spacing="md" style={{ flex: 1 }}>
                                    <Title order={3}>{displaySeries.name}</Title>

                                    {/* Original name if different */}
                                    {displaySeries.o_name && displaySeries.o_name !== displaySeries.name && (
                                        <Text size="sm" color="dimmed" style={{ fontStyle: 'italic' }}>
                                            Original: {displaySeries.o_name}
                                        </Text>
                                    )}

                                    <Group spacing="md">
                                        {displaySeries.year && <Badge color="blue">{displaySeries.year}</Badge>}
                                        {displaySeries.rating && <Badge color="yellow">{displaySeries.rating}</Badge>}
                                        {displaySeries.age && <Badge color="orange">{displaySeries.age}</Badge>}
                                        <Badge color="purple">Series</Badge>
                                        {displaySeries.episode_count && (
                                            <Badge color="gray">{displaySeries.episode_count} episodes</Badge>
                                        )}
                                        {/* imdb_id and tmdb_id badges */}
                                        {displaySeries.imdb_id && (
                                            <Badge
                                                color="yellow"
                                                component="a"
                                                href={imdbUrl(displaySeries.imdb_id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                IMDb
                                            </Badge>
                                        )}
                                        {displaySeries.tmdb_id && (
                                            <Badge
                                                color="cyan"
                                                component="a"
                                                href={tmdbUrl(displaySeries.tmdb_id, 'tv')}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                TMDb
                                            </Badge>
                                        )}
                                    </Group>

                                    {/* Release date */}
                                    {displaySeries.release_date && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Release Date:</strong> {displaySeries.release_date}
                                        </Text>
                                    )}

                                    {displaySeries.genre && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Genre:</strong> {displaySeries.genre}
                                        </Text>
                                    )}

                                    {displaySeries.director && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Director:</strong> {displaySeries.director}
                                        </Text>
                                    )}

                                    {displaySeries.cast && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Cast:</strong> {displaySeries.cast}
                                        </Text>
                                    )}

                                    {displaySeries.country && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Country:</strong> {displaySeries.country}
                                        </Text>
                                    )}

                                    {/* Description */}
                                    {displaySeries.description && (
                                        <Box>
                                            <Text size="sm" weight={500} mb={8}>Description</Text>
                                            <Text size="sm">
                                                {displaySeries.description}
                                            </Text>
                                        </Box>
                                    )}

                                    {/* Watch Trailer button if available */}
                                    {displaySeries.youtube_trailer && (
                                        <Button
                                            variant="outline"
                                            color="red"
                                            style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
                                            onClick={() => {
                                                setTrailerUrl(getEmbedUrl(displaySeries.youtube_trailer));
                                                setTrailerModalOpened(true);
                                            }}
                                        >
                                            Watch Trailer
                                        </Button>
                                    )}
                                </Stack>
                            </Flex>

                            {/* Provider Information */}
                            {displaySeries.m3u_account && (
                                <Box mt="md">
                                    <Text size="sm" weight={500} mb={4}>Provider Information</Text>
                                    <Group spacing="md">
                                        <Badge color="blue" variant="light">
                                            {displaySeries.m3u_account.name}
                                        </Badge>
                                        {displaySeries.m3u_account.account_type && (
                                            <Badge color="gray" variant="outline" size="xs">
                                                {displaySeries.m3u_account.account_type === 'XC' ? 'Xtream Codes' : 'Standard M3U'}
                                            </Badge>
                                        )}
                                    </Group>
                                </Box>
                            )}

                            <Divider />

                            <Title order={4}>
                                Episodes
                                {seriesEpisodes.length > 0 && (
                                    <> ({seriesEpisodes.length})</>
                                )}
                            </Title>

                            {loadingDetails ? (
                                <Flex justify="center" py="xl">
                                    <Loader />
                                </Flex>
                            ) : seasons.length > 0 ? (
                                <Tabs value={activeTab} onChange={setActiveTab}>
                                    <Tabs.List>
                                        {seasons.map(season => (
                                            <Tabs.Tab key={season} value={`season-${season}`}>
                                                Season {season}
                                            </Tabs.Tab>
                                        ))}
                                    </Tabs.List>

                                    {seasons.map(season => (
                                        <Tabs.Panel key={season} value={`season-${season}`} pt="md">
                                            <Table striped highlightOnHover>
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th style={{ width: '60px' }}>Ep</Table.Th>
                                                        <Table.Th>Title</Table.Th>
                                                        <Table.Th style={{ width: '80px' }}>Duration</Table.Th>
                                                        <Table.Th style={{ width: '60px' }}>Date</Table.Th>
                                                        <Table.Th style={{ width: '80px' }}>Action</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {episodesBySeason[season]?.map(episode => (
                                                        <React.Fragment key={episode.id}>
                                                            <Table.Tr
                                                                style={{ cursor: 'pointer' }}
                                                                onClick={() => handleEpisodeRowClick(episode)}
                                                            >
                                                                <Table.Td>
                                                                    <Badge size="sm" variant="outline">
                                                                        {episode.episode_number || '?'}
                                                                    </Badge>
                                                                </Table.Td>
                                                                <Table.Td>
                                                                    <Stack spacing={2}>
                                                                        <Text size="sm" weight={500}>
                                                                            {episode.name}
                                                                        </Text>
                                                                        {episode.genre && (
                                                                            <Text size="xs" color="dimmed">
                                                                                {episode.genre}
                                                                            </Text>
                                                                        )}
                                                                    </Stack>
                                                                </Table.Td>
                                                                <Table.Td>
                                                                    <Text size="xs" color="dimmed">
                                                                        {formatDuration(episode.duration)}
                                                                    </Text>
                                                                </Table.Td>
                                                                <Table.Td>
                                                                    <Text size="xs" color="dimmed">
                                                                        {episode.air_date ? new Date(episode.air_date).toLocaleDateString() : 'N/A'}
                                                                    </Text>
                                                                </Table.Td>
                                                                <Table.Td>
                                                                    <ActionIcon
                                                                        variant="filled"
                                                                        color="blue"
                                                                        size="sm"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handlePlayEpisode(episode);
                                                                        }}
                                                                    >
                                                                        <Play size={12} />
                                                                    </ActionIcon>
                                                                </Table.Td>
                                                            </Table.Tr>
                                                            {expandedEpisode === episode.id && (
                                                                <Table.Tr>
                                                                    <Table.Td colSpan={5} style={{ backgroundColor: '#2A2A2E', padding: '16px' }}>
                                                                        <Stack spacing="sm">
                                                                            {/* Episode Image and Description Row */}
                                                                            <Flex gap="md">
                                                                                {/* Episode Image */}
                                                                                {episode.movie_image && (
                                                                                    <Box style={{ flexShrink: 0 }}>
                                                                                        <Image
                                                                                            src={episode.movie_image}
                                                                                            width={120}
                                                                                            height={160}
                                                                                            alt={episode.name}
                                                                                            fit="cover"
                                                                                            style={{ borderRadius: '4px' }}
                                                                                        />
                                                                                    </Box>
                                                                                )}

                                                                                {/* Episode Description */}
                                                                                <Box style={{ flex: 1 }}>
                                                                                    {episode.description && (
                                                                                        <Box>
                                                                                            <Text size="sm" weight={500} mb={4}>Description</Text>
                                                                                            <Text size="sm" color="dimmed">
                                                                                                {episode.description}
                                                                                            </Text>
                                                                                        </Box>
                                                                                    )}
                                                                                </Box>
                                                                            </Flex>

                                                                            {/* Additional Episode Details */}
                                                                            <Group spacing="xl">
                                                                                {episode.rating && (
                                                                                    <Box>
                                                                                        <Text size="xs" weight={500} color="dimmed" mb={2}>Rating</Text>
                                                                                        <Badge color="yellow" size="sm">{episode.rating}</Badge>
                                                                                    </Box>
                                                                                )}
                                                                                {/* IMDb and TMDb badges for episode */}
                                                                                {(episode.imdb_id || displaySeries.tmdb_id) && (

                                                                                    <Box>
                                                                                        <Text size="xs" weight={500} color="dimmed" mb={2}>Links</Text>
                                                                                        {episode.imdb_id && (
                                                                                            <Badge
                                                                                                color="yellow"
                                                                                                component="a"
                                                                                                href={imdbUrl(episode.imdb_id)}
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                style={{ cursor: 'pointer' }}
                                                                                            >
                                                                                                IMDb
                                                                                            </Badge>
                                                                                        )}
                                                                                        {displaySeries.tmdb_id && (
                                                                                            <Badge
                                                                                                color="cyan"
                                                                                                component="a"
                                                                                                href={
                                                                                                    tmdbUrl(displaySeries.tmdb_id, 'tv') +
                                                                                                    (episode.season_number && episode.episode_number
                                                                                                        ? `/season/${episode.season_number}/episode/${episode.episode_number}`
                                                                                                        : '')
                                                                                                }
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                style={{ cursor: 'pointer' }}
                                                                                            >
                                                                                                TMDb
                                                                                            </Badge>
                                                                                        )}
                                                                                    </Box>
                                                                                )}

                                                                                {episode.director && (
                                                                                    <Box>
                                                                                        <Text size="xs" weight={500} color="dimmed" mb={2}>Director</Text>
                                                                                        <Text size="sm">{episode.director}</Text>
                                                                                    </Box>
                                                                                )}

                                                                                {episode.actors && (
                                                                                    <Box>
                                                                                        <Text size="xs" weight={500} color="dimmed" mb={2}>Cast</Text>
                                                                                        <Text size="sm" lineClamp={2}>{episode.actors}</Text>
                                                                                    </Box>
                                                                                )}
                                                                            </Group>

                                                                            {/* Technical Details */}
                                                                            {(episode.bitrate || episode.video || episode.audio) && (
                                                                                <Box>
                                                                                    <Text size="xs" weight={500} color="dimmed" mb={4}>Technical Details</Text>
                                                                                    <Stack spacing={2}>
                                                                                        {episode.bitrate && episode.bitrate > 0 && (
                                                                                            <Text size="xs" color="dimmed">
                                                                                                <strong>Bitrate:</strong> {episode.bitrate} kbps
                                                                                            </Text>
                                                                                        )}
                                                                                        {episode.video && Object.keys(episode.video).length > 0 && (
                                                                                            <Text size="xs" color="dimmed">
                                                                                                <strong>Video:</strong>{' '}
                                                                                                {episode.video.codec_long_name || episode.video.codec_name}
                                                                                                {episode.video.width && episode.video.height
                                                                                                    ? `, ${episode.video.width}x${episode.video.height}`
                                                                                                    : ''}
                                                                                            </Text>
                                                                                        )}
                                                                                        {episode.audio && Object.keys(episode.audio).length > 0 && (
                                                                                            <Text size="xs" color="dimmed">
                                                                                                <strong>Audio:</strong>{' '}
                                                                                                {episode.audio.codec_long_name || episode.audio.codec_name}
                                                                                                {episode.audio.channels
                                                                                                    ? `, ${episode.audio.channels} channels`
                                                                                                    : ''}
                                                                                            </Text>
                                                                                        )}
                                                                                    </Stack>
                                                                                </Box>
                                                                            )}

                                                                            {/* Provider Information */}
                                                                            {episode.m3u_account && (
                                                                                <Group spacing="md">
                                                                                    <Text size="xs" weight={500} color="dimmed">Provider:</Text>
                                                                                    <Badge color="blue" variant="light" size="sm">
                                                                                        {episode.m3u_account.name || episode.m3u_account}
                                                                                    </Badge>
                                                                                </Group>
                                                                            )}
                                                                        </Stack>
                                                                    </Table.Td>
                                                                </Table.Tr>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Tabs.Panel>
                                    ))}
                                </Tabs>
                            ) : (
                                <Text color="dimmed" align="center" py="xl">
                                    No episodes found for this series.
                                </Text>
                            )}
                        </Stack>
                    </Box>
                </Box>
            </Modal>

            {/* YouTube Trailer Modal */}
            <Modal
                opened={trailerModalOpened}
                onClose={() => setTrailerModalOpened(false)}
                title="Trailer"
                size="xl"
                centered
            >
                <Box style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                    {trailerUrl && (
                        <iframe
                            src={trailerUrl}
                            title="YouTube Trailer"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                borderRadius: 8
                            }}
                        />
                    )}
                </Box>
            </Modal>
        </>
    );
};

const VODModal = ({ vod, opened, onClose }) => {
    const [detailedVOD, setDetailedVOD] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [trailerModalOpened, setTrailerModalOpened] = useState(false);
    const [trailerUrl, setTrailerUrl] = useState('');
    const { fetchMovieDetailsFromProvider } = useVODStore();
    const showVideo = useVideoStore((s) => s.showVideo);
    const env_mode = useSettingsStore((s) => s.environment.env_mode);

    useEffect(() => {
        if (opened && vod && !detailedVOD) {
            setLoadingDetails(true);
            fetchMovieDetailsFromProvider(vod.id)
                .then((details) => {
                    setDetailedVOD(details);
                })
                .catch((error) => {
                    console.warn('Failed to fetch provider details, using basic info:', error);
                    setDetailedVOD(vod); // Fallback to basic data
                })
                .finally(() => {
                    setLoadingDetails(false);
                });
        }
    }, [opened, vod, detailedVOD, fetchMovieDetailsFromProvider]);

    useEffect(() => {
        if (!opened) {
            setDetailedVOD(null);
            setLoadingDetails(false);
            setTrailerModalOpened(false);
            setTrailerUrl('');
        }
    }, [opened]);

    const handlePlayVOD = () => {
        const vodToPlay = detailedVOD || vod;
        if (!vodToPlay) return;

        let streamUrl = `/proxy/vod/movie/${vod.uuid}`;
        if (env_mode === 'dev') {
            streamUrl = `${window.location.protocol}//${window.location.hostname}:5656${streamUrl}`;
        } else {
            streamUrl = `${window.location.origin}${streamUrl}`;
        }
        showVideo(streamUrl, 'vod', vodToPlay);
    };

    const formatDuration = (minutes) => {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    // Helper to get embeddable YouTube URL
    const getEmbedUrl = (url) => {
        if (!url) return '';
        // Accepts full YouTube URLs or just IDs
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        const videoId = match ? match[1] : url;
        return `https://www.youtube.com/embed/${videoId}`;
    };

    if (!vod) return null;

    // Use detailed data if available, otherwise use basic vod data
    const displayVOD = detailedVOD || vod;

    return (
        <>
            <Modal
                opened={opened}
                onClose={onClose}
                title={displayVOD.name}
                size="xl"
                centered
            >
                <Box style={{ position: 'relative', minHeight: 400 }}>
                    {/* Backdrop image as background */}
                    {displayVOD.backdrop_path && displayVOD.backdrop_path.length > 0 && (
                        <>
                            <Image
                                src={displayVOD.backdrop_path[0]}
                                alt={`${displayVOD.name} backdrop`}
                                fit="cover"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    zIndex: 0,
                                    borderRadius: 8,
                                    filter: 'blur(2px) brightness(0.5)'
                                }}
                            />
                            {/* Overlay for readability */}
                            <Box
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    background: 'linear-gradient(180deg, rgba(24,24,27,0.85) 60%, rgba(24,24,27,1) 100%)',
                                    zIndex: 1,
                                    borderRadius: 8
                                }}
                            />
                        </>
                    )}
                    {/* Modal content above backdrop */}
                    <Box style={{ position: 'relative', zIndex: 2 }}>
                        <Stack spacing="md">
                            {loadingDetails && (
                                <Group spacing="xs" mb={8}>
                                    <Loader size="xs" />
                                    <Text size="xs" color="dimmed">Loading additional details...</Text>
                                </Group>
                            )}

                            {/* Movie poster and basic info */}
                            <Flex gap="md">
                                {/* Use movie_image or logo */}
                                {(displayVOD.movie_image || displayVOD.logo?.url) ? (
                                    <Box style={{ flexShrink: 0 }}>
                                        <Image
                                            src={displayVOD.movie_image || displayVOD.logo.url}
                                            width={200}
                                            height={300}
                                            alt={displayVOD.name}
                                            fit="contain"
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Box>
                                ) : (
                                    <Box
                                        style={{
                                            width: 200,
                                            height: 300,
                                            backgroundColor: '#404040',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '8px',
                                            flexShrink: 0
                                        }}
                                    >
                                        <Play size={48} color="#666" />
                                    </Box>
                                )}

                                <Stack spacing="md" style={{ flex: 1 }}>
                                    <Title order={3}>{displayVOD.name}</Title>

                                    {/* Original name if different */}
                                    {displayVOD.o_name && displayVOD.o_name !== displayVOD.name && (
                                        <Text size="sm" color="dimmed" style={{ fontStyle: 'italic' }}>
                                            Original: {displayVOD.o_name}
                                        </Text>
                                    )}

                                    <Group spacing="md">
                                        {displayVOD.year && <Badge color="blue">{displayVOD.year}</Badge>}
                                        {displayVOD.duration && <Badge color="gray">{formatDuration(displayVOD.duration)}</Badge>}
                                        {displayVOD.rating && <Badge color="yellow">{displayVOD.rating}</Badge>}
                                        {displayVOD.age && <Badge color="orange">{displayVOD.age}</Badge>}
                                        <Badge color="green">Movie</Badge>
                                        {/* imdb_id and tmdb_id badges */}
                                        {displayVOD.imdb_id && (
                                            <Badge
                                                color="yellow"
                                                component="a"
                                                href={imdbUrl(displayVOD.imdb_id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                IMDb
                                            </Badge>
                                        )}
                                        {displayVOD.tmdb_id && (
                                            <Badge
                                                color="cyan"
                                                component="a"
                                                href={tmdbUrl(displayVOD.tmdb_id, 'movie')}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                TMDb
                                            </Badge>
                                        )}
                                    </Group>

                                    {/* Release date */}
                                    {displayVOD.release_date && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Release Date:</strong> {displayVOD.release_date}
                                        </Text>
                                    )}

                                    {displayVOD.genre && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Genre:</strong> {displayVOD.genre}
                                        </Text>
                                    )}

                                    {displayVOD.director && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Director:</strong> {displayVOD.director}
                                        </Text>
                                    )}

                                    {displayVOD.actors && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Cast:</strong> {displayVOD.actors}
                                        </Text>
                                    )}

                                    {displayVOD.country && (
                                        <Text size="sm" color="dimmed">
                                            <strong>Country:</strong> {displayVOD.country}
                                        </Text>
                                    )}

                                    {/* Description */}
                                    {displayVOD.description && (
                                        <Box>
                                            <Text size="sm" weight={500} mb={8}>Description</Text>
                                            <Text size="sm">
                                                {displayVOD.description}
                                            </Text>
                                        </Box>
                                    )}

                                    {/* Watch Trailer button at top */}
                                    {displayVOD.youtube_trailer && (
                                        <Button
                                            variant="outline"
                                            color="red"
                                            style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
                                            onClick={() => {
                                                setTrailerUrl(getEmbedUrl(displayVOD.youtube_trailer));
                                                setTrailerModalOpened(true);
                                            }}
                                        >
                                            Watch Trailer
                                        </Button>
                                    )}
                                </Stack>
                            </Flex>

                            {/* Provider Information & Play Button Row */}
                            <Group spacing="md" align="center" mt="md">
                                {/* Provider Information (conditional) */}
                                {vod?.m3u_account && (
                                    <Box>
                                        <Text size="sm" weight={500} mb={8}>IPTV Provider</Text>
                                        <Group spacing="md">
                                            <Badge color="blue" variant="light">
                                                {vod.m3u_account.name}
                                            </Badge>
                                            {vod.m3u_account.account_type && (
                                                <Badge color="gray" variant="outline" size="xs">
                                                    {vod.m3u_account.account_type === 'XC' ? 'Xtream Codes' : 'Standard M3U'}
                                                </Badge>
                                            )}
                                        </Group>
                                    </Box>
                                )}

                                {/* Play Button (always shown) */}
                                <Button
                                    leftSection={<Play size={16} />}
                                    variant="filled"
                                    color="blue"
                                    size="md"
                                    onClick={handlePlayVOD}
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    Play Movie
                                    {vod?.m3u_account && (
                                        <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                                            {`(via ${vod.m3u_account.name}${displayVOD.bitrate ? `, ~${displayVOD.bitrate} kbps` : ''})`}
                                        </span>
                                    )}
                                </Button>
                            </Group>

                            {/* Technical Details */}
                            {(displayVOD.bitrate || displayVOD.video || displayVOD.audio) && (
                                <Stack spacing={4} mt="xs">
                                    <Text size="sm" weight={500}>Technical Details:</Text>
                                    {displayVOD.bitrate && displayVOD.bitrate > 0 && (
                                        <Text size="xs" color="dimmed">
                                            <strong>Bitrate:</strong> {displayVOD.bitrate} kbps
                                        </Text>
                                    )}
                                    {displayVOD.video && Object.keys(displayVOD.video).length > 0 && (
                                        <Text size="xs" color="dimmed">
                                            <strong>Video:</strong>{' '}
                                            {displayVOD.video.codec_long_name || displayVOD.video.codec_name}
                                            {displayVOD.video.profile ? ` (${displayVOD.video.profile})` : ''}
                                            {displayVOD.video.width && displayVOD.video.height
                                                ? `, ${displayVOD.video.width}x${displayVOD.video.height}`
                                                : ''}
                                            {displayVOD.video.display_aspect_ratio
                                                ? `, Aspect Ratio: ${displayVOD.video.display_aspect_ratio}`
                                                : ''}
                                            {displayVOD.video.bit_rate
                                                ? `, Bitrate: ${Math.round(Number(displayVOD.video.bit_rate) / 1000)} kbps`
                                                : ''}
                                            {displayVOD.video.r_frame_rate
                                                ? `, Frame Rate: ${displayVOD.video.r_frame_rate.replace('/', '/')} fps`
                                                : ''}
                                            {displayVOD.video.tags?.encoder
                                                ? `, Encoder: ${displayVOD.video.tags.encoder}`
                                                : ''}
                                        </Text>
                                    )}
                                    {displayVOD.audio && Object.keys(displayVOD.audio).length > 0 && (
                                        <Text size="xs" color="dimmed">
                                            <strong>Audio:</strong>{' '}
                                            {displayVOD.audio.codec_long_name || displayVOD.audio.codec_name}
                                            {displayVOD.audio.profile ? ` (${displayVOD.audio.profile})` : ''}
                                            {displayVOD.audio.channel_layout
                                                ? `, Channels: ${displayVOD.audio.channel_layout}`
                                                : displayVOD.audio.channels
                                                    ? `, Channels: ${displayVOD.audio.channels}`
                                                    : ''}
                                            {displayVOD.audio.sample_rate
                                                ? `, Sample Rate: ${displayVOD.audio.sample_rate} Hz`
                                                : ''}
                                            {displayVOD.audio.bit_rate
                                                ? `, Bitrate: ${Math.round(Number(displayVOD.audio.bit_rate) / 1000)} kbps`
                                                : ''}
                                            {displayVOD.audio.tags?.handler_name
                                                ? `, Handler: ${displayVOD.audio.tags.handler_name}`
                                                : ''}
                                        </Text>
                                    )}
                                </Stack>
                            )}
                            {/* YouTube trailer if available */}
                        </Stack>
                    </Box>
                </Box>
            </Modal>
            {/* YouTube Trailer Modal */}
            <Modal
                opened={trailerModalOpened}
                onClose={() => setTrailerModalOpened(false)}
                title="Trailer"
                size="xl"
                centered
                withCloseButton
            >
                <Box style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                    {trailerUrl && (
                        <iframe
                            src={trailerUrl}
                            title="YouTube Trailer"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                borderRadius: 8
                            }}
                        />
                    )}
                </Box>
            </Modal>
        </>
    );
};

const MIN_CARD_WIDTH = 260;
const MAX_CARD_WIDTH = 320;

const useCardColumns = () => {
    const [columns, setColumns] = useState(4);

    useEffect(() => {
        const calcColumns = () => {
            const container = document.getElementById('vods-container');
            const width = container ? container.offsetWidth : window.innerWidth;
            let colCount = Math.floor(width / MIN_CARD_WIDTH);
            if (colCount < 1) colCount = 1;
            if (colCount > 6) colCount = 6;
            setColumns(colCount);
        };
        calcColumns();
        window.addEventListener('resize', calcColumns);
        return () => window.removeEventListener('resize', calcColumns);
    }, []);

    return columns;
};

const VODsPage = () => {
    const {
        movies,
        series,
        episodes,
        categories,
        loading,
        filters,
        currentPage,
        totalCount,
        pageSize,
        setFilters,
        setPage,
        fetchMovies,
        fetchSeries,
        fetchCategories
    } = useVODStore();

    const showVideo = useVideoStore((s) => s.showVideo);
    const [selectedSeries, setSelectedSeries] = useState(null);
    const [selectedVOD, setSelectedVOD] = useState(null);
    const [seriesModalOpened, { open: openSeriesModal, close: closeSeriesModal }] = useDisclosure(false);
    const [vodModalOpened, { open: openVODModal, close: closeVODModal }] = useDisclosure(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const columns = useCardColumns();

    // Helper function to get display data based on current filters
    const getDisplayData = () => {
        if (filters.type === 'series') {
            return Object.values(series).map(item => ({ ...item, _vodType: 'series' }));
        } else if (filters.type === 'movies') {
            return Object.values(movies).map(item => ({ ...item, _vodType: 'movie' }));
        } else {
            // 'all' - combine movies and series, tagging each with its type
            return [
                ...Object.values(movies).map(item => ({ ...item, _vodType: 'movie' })),
                ...Object.values(series).map(item => ({ ...item, _vodType: 'series' }))
            ];
        }
    };

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        if (filters.type === 'series') {
            fetchSeries().finally(() => setInitialLoad(false));
        } else {
            fetchMovies().finally(() => setInitialLoad(false));
        }
    }, [filters, currentPage, fetchMovies, fetchSeries]);

    const handleVODCardClick = (vod) => {
        setSelectedVOD(vod);
        openVODModal();
    };

    const handleSeriesClick = (series) => {
        setSelectedSeries(series);
        openSeriesModal();
    };

    const categoryOptions = [
        { value: '', label: 'All Categories' },
        ...Object.values(categories).map(cat => ({
            value: cat.name,
            label: cat.name
        }))
    ];

    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <Box p="md" id="vods-container">
            <Stack spacing="md">
                <Group position="apart">
                    <Title order={2}>Video on Demand</Title>
                </Group>

                {/* Filters */}
                <Group spacing="md">
                    <SegmentedControl
                        value={filters.type}
                        onChange={(value) => setFilters({ type: value })}
                        data={[
                            { label: 'All', value: 'all' },
                            { label: 'Movies', value: 'movies' },
                            { label: 'Series', value: 'series' }
                        ]}
                    />

                    <TextInput
                        placeholder="Search VODs..."
                        icon={<Search size={16} />}
                        value={filters.search}
                        onChange={(e) => setFilters({ search: e.target.value })}
                        style={{ minWidth: 200 }}
                    />

                    <Select
                        placeholder="Category"
                        data={categoryOptions}
                        value={filters.category}
                        onChange={(value) => setFilters({ category: value })}
                        clearable
                        style={{ minWidth: 150 }}
                    />
                </Group>

                {/* Content */}
                {initialLoad ? (
                    <Flex justify="center" py="xl">
                        <Loader size="lg" />
                    </Flex>
                ) : (
                    <>
                        {filters.type === 'series' ? (
                            <Grid gutter="md">
                                {Object.values(series).map(seriesItem => (
                                    <Grid.Col
                                        span={12 / columns}
                                        key={seriesItem.id}
                                        style={{ minWidth: MIN_CARD_WIDTH, maxWidth: MAX_CARD_WIDTH, margin: '0 auto' }}
                                    >
                                        <SeriesCard
                                            series={seriesItem}
                                            onClick={handleSeriesClick}
                                        />
                                    </Grid.Col>
                                ))}
                            </Grid>
                        ) : (
                            <Grid gutter="md">
                                {getDisplayData().map(item => (
                                    <Grid.Col
                                        span={12 / columns}
                                        key={item.id}
                                        style={{ minWidth: MIN_CARD_WIDTH, maxWidth: MAX_CARD_WIDTH, margin: '0 auto' }}
                                    >
                                        {item._vodType === 'series' ? (
                                            <SeriesCard
                                                series={item}
                                                onClick={handleSeriesClick}
                                            />
                                        ) : (
                                            <VODCard vod={item} onClick={handleVODCardClick} />
                                        )}
                                    </Grid.Col>
                                ))}
                            </Grid>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <Flex justify="center" mt="md">
                                <Pagination
                                    page={currentPage}
                                    onChange={setPage}
                                    total={totalPages}
                                />
                            </Flex>
                        )}
                    </>
                )}
            </Stack>

            {/* Series Episodes Modal */}
            <SeriesModal
                series={selectedSeries}
                opened={seriesModalOpened}
                onClose={closeSeriesModal}
            />

            {/* VOD Details Modal */}
            <VODModal
                vod={selectedVOD}
                opened={vodModalOpened}
                onClose={closeVODModal}
            />
        </Box>
    );
};

export default VODsPage;
