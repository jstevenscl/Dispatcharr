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
    Modal
} from '@mantine/core';
import { Search, Play, Calendar, Clock, Star } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import useVODStore from '../store/useVODStore';
import useVideoStore from '../store/useVideoStore';
import useSettingsStore from '../store/settings';

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

                    <Text size="xs" color="dimmed">
                        {series.episode_count} episodes
                    </Text>
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
    const { fetchSeriesEpisodes, vods, loading } = useVODStore();
    const showVideo = useVideoStore((s) => s.showVideo);

    useEffect(() => {
        if (opened && series) {
            fetchSeriesEpisodes(series.id);
        }
    }, [opened, series, fetchSeriesEpisodes]);

    const episodes = Object.values(vods).filter(
        vod => vod.type === 'episode' && vod.series?.id === series?.id
    ).sort((a, b) => {
        if (a.season_number !== b.season_number) {
            return (a.season_number || 0) - (b.season_number || 0);
        }
        return (a.episode_number || 0) - (b.episode_number || 0);
    });

    const handlePlayEpisode = (episode) => {
        const streamUrl = `${window.location.origin}${episode.stream_url}`;
        showVideo(streamUrl, 'vod'); // Specify VOD content type
    };

    if (!series) return null;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={series.name}
            size="xl"
            centered
        >
            <Stack spacing="md">
                {series.description && (
                    <Text size="sm" color="dimmed">
                        {series.description}
                    </Text>
                )}

                <Group spacing="md">
                    {series.year && <Badge color="blue">{series.year}</Badge>}
                    {series.rating && <Badge color="yellow">{series.rating}</Badge>}
                    {series.genre && <Badge color="gray">{series.genre}</Badge>}
                </Group>

                <Title order={4}>Episodes</Title>

                {loading ? (
                    <Flex justify="center" py="xl">
                        <Loader />
                    </Flex>
                ) : (
                    <Grid>
                        {episodes.map(episode => (
                            <Grid.Col span={6} key={episode.id}>
                                <VODCard vod={episode} onClick={handlePlayEpisode} />
                            </Grid.Col>
                        ))}
                    </Grid>
                )}
            </Stack>
        </Modal>
    );
};

const VODModal = ({ vod, opened, onClose }) => {
    const [detailedVOD, setDetailedVOD] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [trailerModalOpened, setTrailerModalOpened] = useState(false);
    const [trailerUrl, setTrailerUrl] = useState('');
    const { fetchVODDetailsFromProvider } = useVODStore();
    const showVideo = useVideoStore((s) => s.showVideo);
    const env_mode = useSettingsStore((s) => s.environment.env_mode);

    useEffect(() => {
        if (opened && vod && !detailedVOD) {
            setLoadingDetails(true);
            fetchVODDetailsFromProvider(vod.id)
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
    }, [opened, vod, detailedVOD, fetchVODDetailsFromProvider]);

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
                                    {/* Removed Play Movie button from here */}
                                </Stack>
                            </Flex>
                            {/* Provider Information & Play Button Row */}
                            {(vod?.m3u_account || true) && (
                                <Group spacing="md" align="center" mt="md">
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
                            )}
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
        vods,
        series,
        categories,
        loading,
        filters,
        currentPage,
        totalCount,
        pageSize,
        setFilters,
        setPage,
        fetchVODs,
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

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        if (filters.type === 'series') {
            fetchSeries().finally(() => setInitialLoad(false));
        } else {
            fetchVODs().finally(() => setInitialLoad(false));
        }
    }, [filters, currentPage, fetchVODs, fetchSeries]);

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
                                {Object.values(vods).map(vod => (
                                    <Grid.Col
                                        span={12 / columns}
                                        key={vod.id}
                                        style={{ minWidth: MIN_CARD_WIDTH, maxWidth: MAX_CARD_WIDTH, margin: '0 auto' }}
                                    >
                                        <VODCard vod={vod} onClick={handleVODCardClick} />
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
