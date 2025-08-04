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

    return (
        <Card
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{ cursor: 'pointer', backgroundColor: '#27272A' }}
            onClick={() => onClick(vod)}
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
    const [seriesModalOpened, { open: openSeriesModal, close: closeSeriesModal }] = useDisclosure(false);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        if (filters.type === 'series') {
            fetchSeries();
        } else {
            fetchVODs();
        }
    }, [filters, currentPage, fetchVODs, fetchSeries]);





    const env_mode = useSettingsStore((s) => s.environment.env_mode);
    const handlePlayVOD = (vod) => {
        let streamUrl = vod.stream_url;
        if (env_mode === 'dev') {
            streamUrl = `${window.location.protocol}//${window.location.hostname}:5656${vod.stream_url}`;
        } else {
            streamUrl = `${window.location.origin}${vod.stream_url}`;
        }
        showVideo(streamUrl, 'vod'); // Specify VOD content type
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
        <Box p="md">
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
                {loading ? (
                    <Flex justify="center" py="xl">
                        <Loader size="lg" />
                    </Flex>
                ) : (
                    <>
                        {filters.type === 'series' ? (
                            <Grid>
                                {Object.values(series).map(seriesItem => (
                                    <Grid.Col span={3} key={seriesItem.id}>
                                        <SeriesCard
                                            series={seriesItem}
                                            onClick={handleSeriesClick}
                                        />
                                    </Grid.Col>
                                ))}
                            </Grid>
                        ) : (
                            <Grid>
                                {Object.values(vods).map(vod => (
                                    <Grid.Col span={3} key={vod.id}>
                                        <VODCard vod={vod} onClick={handlePlayVOD} />
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
        </Box>
    );
};

export default VODsPage;
