import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import * as api from './api';
import { Sparkline } from './Sparkline';
import { HistoryChart } from './HistoryChart';
import { ConfigModal, type ConfigForm } from './ConfigModal';
import { AccordionStep } from './AccordionStep';
import './App.css';

type GroupingType = 'groups' | 'tags' | 'sensor_types';

type GroupingItem = { id: number | string; label: string };
type ObjectItem = {
  id: number;
  label: string;
  device_id: number;
  group_id?: number;
  group_label?: string | null;
  tag_labels?: string[];
  department_label?: string | null;
};
type SensorItem = {
  sensor_id?: number | null;
  label: string;
  input_label: string;
  source?: 'input' | 'state' | 'tracking';
  sensor_type?: string | null;
  sensor_units?: string | null;
  description_parameters?: { name: string; value: unknown }[];
};
type ConfiguredSensor = {
  configured_sensor_id: number;
  object_id: number;
  device_id: number;
  sensor_input_label: string;
  sensor_source?: string;
  sensor_label_custom: string;
  min_threshold: number | null;
  max_threshold: number | null;
  object_label: string;
  created_at?: string;
};
type DashboardPlane = {
  dashboard_plane_id: number;
  configured_sensor_id: number;
  position_index: number;
  object_id: number;
  device_id: number;
  sensor_input_label: string;
  sensor_source?: string;
  sensor_label_custom: string;
  min_threshold: number | null;
  max_threshold: number | null;
  object_label: string;
};

const GROUPING_LABELS: Record<GroupingType, string> = {
  groups: 'Groups',
  tags: 'Tags',
  sensor_types: 'Sensor type',
};

export default function App() {
  const [groupingType, setGroupingType] = useState<GroupingType>('groups');
  const [groupingSearch, setGroupingSearch] = useState('');
  const [groupingItems, setGroupingItems] = useState<GroupingItem[]>([]);
  const [selectedGroupingIds, setSelectedGroupingIds] = useState<Record<GroupingType, (number | string)[]>>({
    groups: [], tags: [], sensor_types: [],
  });
  const [objects, setObjects] = useState<ObjectItem[]>([]);
  const [objectsSearch, setObjectsSearch] = useState('');
  const [selectedObjectIds, setSelectedObjectIds] = useState<number[]>([]);
  const [sensorsByObject, setSensorsByObject] = useState<Record<number, SensorItem[]>>({});
  const [selectedSensorsByObject, setSelectedSensorsByObject] = useState<Record<number, Array<{ sensor: SensorItem | null; device_id: number }>>>({});
  const [configModal, setConfigModal] = useState<ConfigForm | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [configured, setConfigured] = useState<ConfiguredSensor[]>([]);
  const [sparklineData, setSparklineData] = useState<Record<string, { ts: string; value: number | null }[]>>({});
  const [dashboardPlanes, setDashboardPlanes] = useState<DashboardPlane[]>([]);
  const [dashboardValues, setDashboardValues] = useState<Record<string, { value: number | null; ts: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<api.ApiDebugInfo | null>(null);
  const [openStep, setOpenStep] = useState<number>(0);
  const [objectListView, setObjectListView] = useState<'full' | 'groups' | 'tags'>('full');
  const [dashboardUpdateSeconds, setDashboardUpdateSeconds] = useState<number>(60);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportDashboardName, setExportDashboardName] = useState('');
  const [historyPlane, setHistoryPlane] = useState<DashboardPlane | null>(null);
  const [historyDurationHours, setHistoryDurationHours] = useState<api.SensorHistoryHours>(1);
  const [historyData, setHistoryData] = useState<{ ts: string; value: number | null }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadGroupings = useCallback(async () => {
    setLoading('groupings');
    setError(null);
    try {
      const list = await api.getGroupings(groupingType, groupingSearch || undefined);
      setGroupingItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }, [groupingType, groupingSearch]);

  useEffect(() => { loadGroupings(); }, [loadGroupings]);

  const loadObjects = useCallback(async () => {
    setLoading('objects');
    setError(null);
    try {
      const filter: Parameters<typeof api.getObjects>[0] = {};
      if (selectedGroupingIds.groups.length) filter.group_ids = selectedGroupingIds.groups as number[];
      if (selectedGroupingIds.tags.length) filter.tag_ids = selectedGroupingIds.tags as number[];
      if (selectedGroupingIds.sensor_types.length) filter.sensor_type_ids = selectedGroupingIds.sensor_types as string[];
      filter.include_grouping_info = true;
      const list = await api.getObjects(filter);
      setObjects(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }, [selectedGroupingIds]);

  useEffect(() => { loadObjects(); }, [selectedGroupingIds.groups, selectedGroupingIds.tags, selectedGroupingIds.sensor_types]);

  const loadSensorsForObject = useCallback(async (objectId: number, _deviceId: number) => {
    try {
      const list = await api.getSensorsForObject(objectId);
      setSensorsByObject((prev) => ({ ...prev, [objectId]: list }));
    } catch (_) {}
  }, []);

  useEffect(() => {
    selectedObjectIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && !sensorsByObject[id]) loadSensorsForObject(id, obj.device_id);
    });
  }, [selectedObjectIds, objects, loadSensorsForObject]);

  useEffect(() => {
    setSelectedSensorsByObject((prev) => {
      let next = { ...prev };
      selectedObjectIds.forEach((id) => {
        const obj = objects.find((o) => o.id === id);
        if (!obj) return;
        const slots = next[id];
        if (slots && slots.length > 0) return;
        next = { ...next, [id]: [{ sensor: null, device_id: obj.device_id }] };
      });
      return next;
    });
  }, [selectedObjectIds, objects]);

  const addSensorSlot = (objectId: number, deviceId: number) => {
    setSelectedSensorsByObject((prev) => ({
      ...prev,
      [objectId]: [...(prev[objectId] ?? []), { sensor: null, device_id: deviceId }],
    }));
  };

  const [useLocalConfig, setUseLocalConfig] = useState(false);

  const loadConfigured = useCallback(async () => {
    setError(null);
    if (useLocalConfig) {
      const list = api.getLocalConfiguredSensors() as ConfiguredSensor[];
      setConfigured(list);
      return;
    }
    try {
      const list = await api.getConfiguredSensors();
      setConfigured(list);
    } catch (e) {
      const is503 = e instanceof api.ApiError && e.debug?.status === 503;
      if (is503) {
        setUseLocalConfig(true);
        const list = api.getLocalConfiguredSensors() as ConfiguredSensor[];
        setConfigured(list);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [useLocalConfig]);

  const loadDashboard = useCallback(async () => {
    if (useLocalConfig) {
      const list = api.getLocalDashboardPlanes() as DashboardPlane[];
      setDashboardPlanes(list);
      return;
    }
    try {
      const list = await api.getDashboardPlanes();
      setDashboardPlanes(list);
    } catch (e) {
      const is503 = e instanceof api.ApiError && e.debug?.status === 503;
      if (is503) {
        setUseLocalConfig(true);
        const list = api.getLocalDashboardPlanes() as DashboardPlane[];
        setDashboardPlanes(list);
      }
    }
  }, [useLocalConfig]);

  useEffect(() => { loadConfigured(); }, [loadConfigured]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const loadSparklines = useCallback(async () => {
    if (configured.length === 0) return;
    try {
      const pairs = configured.map((c) => ({
        device_id: c.device_id,
        sensor_input_label: c.sensor_input_label,
        sensor_source: (c.sensor_source as 'input' | 'state' | 'tracking') || 'input',
      }));
      const res = await api.getSparklines(pairs);
      setSparklineData(res.series || {});
    } catch (_) {}
  }, [configured]);

  useEffect(() => { loadSparklines(); }, [configured, loadSparklines]);

  const loadDashboardValues = useCallback(async () => {
    if (dashboardPlanes.length === 0) return;
    try {
      const pairs = dashboardPlanes.map((p) => ({
        device_id: p.device_id,
        sensor_input_label: p.sensor_input_label,
        sensor_source: (p.sensor_source as 'input' | 'state' | 'tracking') || 'input',
      }));
      const res = await api.getLatestValues(pairs);
      setDashboardValues(res.values || {});
    } catch (_) {}
  }, [dashboardPlanes]);

  useEffect(() => { loadDashboardValues(); }, [dashboardPlanes, loadDashboardValues]);
  useEffect(() => {
    const ms = dashboardUpdateSeconds * 1000;
    const t = setInterval(loadDashboardValues, ms);
    return () => clearInterval(t);
  }, [loadDashboardValues, dashboardUpdateSeconds]);

  useEffect(() => {
    if (!historyPlane) {
      setHistoryData([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    api
      .getSensorHistory(
        {
          device_id: historyPlane.device_id,
          sensor_input_label: historyPlane.sensor_input_label,
          sensor_source: (historyPlane.sensor_source as 'input' | 'state' | 'tracking') || 'input',
        },
        historyDurationHours
      )
      .then((res) => {
        if (!cancelled) setHistoryData(res.series || []);
      })
      .catch(() => {
        if (!cancelled) setHistoryData([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyPlane, historyDurationHours]);

  const toggleGrouping = (type: GroupingType, id: number | string) => {
    setSelectedGroupingIds((prev) => ({
      ...prev,
      [type]: prev[type].includes(id) ? prev[type].filter((x) => x !== id) : [...prev[type], id],
    }));
  };

  const clearGrouping = (type: GroupingType) => {
    setSelectedGroupingIds((prev) => ({ ...prev, [type]: [] }));
  };

  const filteredObjects = objectsSearch.trim()
    ? objects.filter((o) => o.label.toLowerCase().includes(objectsSearch.toLowerCase()))
    : objects;

  type GroupKey = string;
  const groupedObjects: { key: GroupKey; label: string; items: ObjectItem[] }[] = (() => {
    if (objectListView === 'full') return [{ key: '_', label: 'All', items: filteredObjects }];
    const acc: Record<string, ObjectItem[]> = {};
    filteredObjects.forEach((o) => {
      const keys: GroupKey[] = [];
      if (objectListView === 'groups') keys.push((o.group_label || 'No group') as GroupKey);
      else if (objectListView === 'tags') (o.tag_labels?.length ? o.tag_labels : ['No tag']).forEach((t) => keys.push(t as GroupKey));
      keys.forEach((k) => {
        if (!acc[k]) acc[k] = [];
        if (!acc[k].some((x) => x.id === o.id)) acc[k].push(o);
      });
    });
    return Object.entries(acc)
      .map(([key, items]) => ({ key, label: key, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  const toggleObject = (id: number) => {
    setSelectedObjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllObjects = () => {
    setSelectedObjectIds(filteredObjects.map((o) => o.id));
  };

  const openConfigModal = (obj: ObjectItem, sensor: SensorItem) => {
    setEditingConfigId(null);
    const source = sensor.source || 'input';
    setConfigModal({
      object_id: obj.id,
      object_label: obj.label,
      device_id: obj.device_id,
      sensor_input_label: sensor.input_label,
      sensor_source: source,
      sensor_label: sensor.label || sensor.input_label,
      sensor_label_custom: sensor.label || sensor.input_label,
      min_threshold: '',
      max_threshold: '',
    });
  };

  const openEditModal = (c: ConfiguredSensor) => {
    setEditingConfigId(c.configured_sensor_id);
    setConfigModal({
      object_id: c.object_id,
      object_label: c.object_label,
      device_id: c.device_id,
      sensor_input_label: c.sensor_input_label,
      sensor_source: c.sensor_source || 'input',
      sensor_label: c.sensor_input_label,
      sensor_label_custom: c.sensor_label_custom,
      min_threshold: c.min_threshold != null ? String(c.min_threshold) : '',
      max_threshold: c.max_threshold != null ? String(c.max_threshold) : '',
    });
  };

  const handleConfigSave = async (form: ConfigForm) => {
    setError(null);
    setDebugInfo(null);
    const minVal = form.min_threshold.trim() ? parseFloat(form.min_threshold) : null;
    const maxVal = form.max_threshold.trim() ? parseFloat(form.max_threshold) : null;
    const source = (form.sensor_source as 'input' | 'state' | 'tracking') || 'input';

    if (useLocalConfig) {
      const list = api.getLocalConfiguredSensors() as ConfiguredSensor[];
      if (editingConfigId) {
        const out = list.map((c) =>
          c.configured_sensor_id === editingConfigId
            ? { ...c, sensor_label_custom: form.sensor_label_custom, min_threshold: minVal, max_threshold: maxVal }
            : c
        );
        api.setLocalConfiguredSensors(out);
      } else {
        const localId = -Date.now();
        list.push({
          configured_sensor_id: localId,
          object_id: form.object_id,
          device_id: form.device_id,
          sensor_input_label: form.sensor_input_label,
          sensor_source: source,
          sensor_label_custom: form.sensor_label_custom,
          min_threshold: minVal,
          max_threshold: maxVal,
          object_label: form.object_label,
        });
        api.setLocalConfiguredSensors(list);
      }
      setConfigModal(null);
      setEditingConfigId(null);
      loadConfigured();
      return;
    }

    try {
      if (editingConfigId) {
        await api.updateConfiguredSensor(editingConfigId, {
          sensor_label_custom: form.sensor_label_custom,
          min_threshold: minVal,
          max_threshold: maxVal,
        });
      } else {
        await api.addConfiguredSensor({
          object_id: form.object_id,
          device_id: form.device_id,
          sensor_input_label: form.sensor_input_label,
          sensor_source: source,
          sensor_label_custom: form.sensor_label_custom,
          min_threshold: minVal,
          max_threshold: maxVal,
        });
      }
      setConfigModal(null);
      setEditingConfigId(null);
      loadConfigured();
    } catch (e) {
      const is503 = e instanceof api.ApiError && e.debug?.status === 503;
      if (is503) {
        setUseLocalConfig(true);
        const list = api.getLocalConfiguredSensors() as ConfiguredSensor[];
        if (editingConfigId) {
          const out = list.map((c) =>
            c.configured_sensor_id === editingConfigId
              ? { ...c, sensor_label_custom: form.sensor_label_custom, min_threshold: minVal, max_threshold: maxVal }
              : c
          );
          api.setLocalConfiguredSensors(out);
        } else {
          list.push({
            configured_sensor_id: -Date.now(),
            object_id: form.object_id,
            device_id: form.device_id,
            sensor_input_label: form.sensor_input_label,
            sensor_source: source,
            sensor_label_custom: form.sensor_label_custom,
            min_threshold: minVal,
            max_threshold: maxVal,
            object_label: form.object_label,
          });
          api.setLocalConfiguredSensors(list);
        }
        setConfigModal(null);
        setEditingConfigId(null);
        setConfigured(api.getLocalConfiguredSensors() as ConfiguredSensor[]);
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      if (e instanceof api.ApiError) setDebugInfo(e.debug);
      else setDebugInfo(null);
    }
  };

  const handleRemoveConfigured = (id: number) => {
    setConfirmDialog({
      title: 'Remove sensor',
      message: 'This sensor will be removed from your configured list. You can add it again later from the left panel.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        if (useLocalConfig) {
          const list = (api.getLocalConfiguredSensors() as ConfiguredSensor[]).filter((c) => c.configured_sensor_id !== id);
          api.setLocalConfiguredSensors(list);
          const planes = (api.getLocalDashboardPlanes() as DashboardPlane[]).filter((p) => p.configured_sensor_id !== id);
          api.setLocalDashboardPlanes(planes);
          loadConfigured();
          loadDashboard();
          return;
        }
        try {
          await api.deleteConfiguredSensor(id);
          loadConfigured();
          loadDashboard();
        } catch (e) {
          const is503 = e instanceof api.ApiError && e.debug?.status === 503;
          if (is503) {
            setUseLocalConfig(true);
            handleRemoveConfigured(id);
          } else setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const addToDashboard = async (configured_sensor_id: number) => {
    if (useLocalConfig) {
      const c = configured.find((x) => x.configured_sensor_id === configured_sensor_id);
      if (!c) return;
      const planes = api.getLocalDashboardPlanes() as DashboardPlane[];
      const planeId = -Date.now();
      planes.push({
        dashboard_plane_id: planeId,
        configured_sensor_id: c.configured_sensor_id,
        position_index: planes.length,
        object_id: c.object_id,
        device_id: c.device_id,
        sensor_input_label: c.sensor_input_label,
        sensor_source: c.sensor_source,
        sensor_label_custom: c.sensor_label_custom,
        min_threshold: c.min_threshold,
        max_threshold: c.max_threshold,
        object_label: c.object_label,
      });
      api.setLocalDashboardPlanes(planes);
      loadDashboard();
      return;
    }
    try {
      await api.addDashboardPlane(configured_sensor_id, dashboardPlanes.length);
      loadDashboard();
    } catch (e) {
      const is503 = e instanceof api.ApiError && e.debug?.status === 503;
      if (is503) {
        setUseLocalConfig(true);
        addToDashboard(configured_sensor_id);
      } else setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeFromDashboard = async (dashboard_plane_id: number) => {
    if (useLocalConfig) {
      const planes = (api.getLocalDashboardPlanes() as DashboardPlane[]).filter((p) => p.dashboard_plane_id !== dashboard_plane_id);
      api.setLocalDashboardPlanes(planes);
      loadDashboard();
      return;
    }
    try {
      await api.removeDashboardPlane(dashboard_plane_id);
      loadDashboard();
    } catch (_) {}
  };

  const confirmRemoveFromDashboard = (p: DashboardPlane) => {
    setConfirmDialog({
      title: 'Remove from dashboard',
      message: `"${p.sensor_label_custom}" will be removed from the dashboard. You can add it back from the configured sensors list.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => {
        setConfirmDialog(null);
        removeFromDashboard(p.dashboard_plane_id);
      },
    });
  };

  const sparkKey = (deviceId: number, sensor: string, source: string = 'input') => `${deviceId}:${source}:${sensor}`;
  const inThreshold = (val: number | null, min: number | null, max: number | null) => {
    if (val == null) return true;
    if (min != null && val < min) return false;
    if (max != null && val > max) return false;
    return true;
  };

  const openExportModal = () => setExportModalOpen(true);

  const exportDashboard = (name: string) => {
    const safeName = name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') || 'dashboard';
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      name: name.trim() || undefined,
      dashboard: {
        planes: dashboardPlanes.map((p) => ({
          configured_sensor_id: p.configured_sensor_id,
          position_index: p.position_index,
          device_id: p.device_id,
          sensor_input_label: p.sensor_input_label,
          sensor_source: p.sensor_source || 'input',
          object_label: p.object_label,
        })),
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensoriqua-dashboard-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModalOpen(false);
    setExportDashboardName('');
  };

  const findConfiguredForPlane = (
    p: { configured_sensor_id?: number; device_id?: number; sensor_input_label?: string; sensor_source?: string }
  ): ConfiguredSensor | undefined => {
    if (p.configured_sensor_id != null) {
      const byId = configured.find((c) => c.configured_sensor_id === p.configured_sensor_id);
      if (byId) return byId;
    }
    const deviceId = p.device_id != null ? Number(p.device_id) : NaN;
    const label = typeof p.sensor_input_label === 'string' ? p.sensor_input_label.trim() : '';
    const source = (p.sensor_source === 'state' || p.sensor_source === 'tracking' ? p.sensor_source : 'input') as 'input' | 'state' | 'tracking';
    if (!Number.isNaN(deviceId) && label) {
      return configured.find(
        (c) =>
          c.device_id === deviceId &&
          c.sensor_input_label === label &&
          ((c.sensor_source || 'input') === source)
      );
    }
    return undefined;
  };

  const importDashboard = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const planes =
        data?.dashboard?.planes ??
        data?.dashboard?.Planes ??
        data?.planes ??
        data?.Planes ??
        (Array.isArray(data) ? data : null);
      if (!Array.isArray(planes) || planes.length === 0) {
        setError('Invalid dashboard JSON: expected "dashboard.planes" or "planes" array');
        return;
      }
      const normalized: { configured_sensor_id?: number; device_id?: number; sensor_input_label?: string; sensor_source?: string; position_index: number }[] = [];
      for (let i = 0; i < planes.length; i++) {
        const raw = planes[i] as Record<string, unknown>;
        if (!raw || typeof raw !== 'object') continue;
        const idRaw = raw.configured_sensor_id ?? raw.configuredSensorId ?? raw['configured_sensor_id'];
        const id = typeof idRaw === 'number' && !Number.isNaN(idRaw) ? idRaw : Number(idRaw);
        const deviceIdRaw = raw.device_id ?? raw.deviceId;
        const deviceId = typeof deviceIdRaw === 'number' && !Number.isNaN(deviceIdRaw) ? deviceIdRaw : Number(deviceIdRaw);
        const labelRaw = raw.sensor_input_label ?? raw.sensorInputLabel;
        const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
        const posRaw = raw.position_index ?? raw.positionIndex ?? i;
        const pos = typeof posRaw === 'number' && !Number.isNaN(posRaw) ? posRaw : i;
        const hasId = !Number.isNaN(id) && id >= 0;
        const hasIdentity = !Number.isNaN(deviceId) && label.length > 0;
        if (hasId || hasIdentity) {
          normalized.push({
            ...(hasId && { configured_sensor_id: id }),
            ...(hasIdentity && { device_id: deviceId, sensor_input_label: label, sensor_source: (raw.sensor_source ?? raw.sensorSource) === 'state' || (raw.sensor_source ?? raw.sensorSource) === 'tracking' ? (raw.sensor_source ?? raw.sensorSource) as string : 'input' }),
            position_index: pos,
          });
        }
      }
      if (normalized.length === 0) {
        setError('Invalid dashboard JSON: each plane must be an object with configured_sensor_id (number) or device_id + sensor_input_label. Re-export the dashboard from the app to get a compatible format.');
        return;
      }
      const matched: { configured_sensor_id: number; position_index: number }[] = [];
      for (const p of normalized) {
        const c = findConfiguredForPlane(p);
        if (c) matched.push({ configured_sensor_id: c.configured_sensor_id, position_index: p.position_index });
      }
      if (matched.length === 0) {
        setError('No panels could be matched to your configured sensors. Add the same sensors to "Configured sensors" first, then import again.');
        return;
      }
      if (useLocalConfig) {
        const newPlanes: DashboardPlane[] = [];
        matched.forEach((m, i) => {
          const c = configured.find((x) => x.configured_sensor_id === m.configured_sensor_id);
          if (!c) return;
          newPlanes.push({
            dashboard_plane_id: -Date.now() - i,
            configured_sensor_id: c.configured_sensor_id,
            position_index: m.position_index,
            object_id: c.object_id,
            device_id: c.device_id,
            sensor_input_label: c.sensor_input_label,
            sensor_source: c.sensor_source,
            sensor_label_custom: c.sensor_label_custom,
            min_threshold: c.min_threshold,
            max_threshold: c.max_threshold,
            object_label: c.object_label,
          });
        });
        api.setLocalDashboardPlanes(newPlanes);
        await loadDashboard();
        if (matched.length < normalized.length) {
          setError(`Imported ${matched.length} panel(s). ${normalized.length - matched.length} skipped (no matching sensor in your list).`);
        }
        return;
      }
      for (const { dashboard_plane_id } of dashboardPlanes) {
        await api.removeDashboardPlane(dashboard_plane_id);
      }
      for (let i = 0; i < matched.length; i++) {
        const m = matched[i];
        await api.addDashboardPlane(m.configured_sensor_id, m.position_index);
      }
      await loadDashboard();
      if (matched.length < normalized.length) {
        setError(`Imported ${matched.length} panel(s). ${normalized.length - matched.length} skipped (no matching sensor in your list).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importDashboard(file);
    e.target.value = '';
  };

  return (
    <div className="app">
      <header className="top-bar">
        <div className="top-bar-brand">
          <div className="top-bar-title">Sensoriqua</div>
          <p className="top-bar-tagline">
            Simple dashboard builder for monitoring sensor readings in real time (enabled by Navixy IoT Query)
            {useLocalConfig && (
              <span className="top-bar-local-hint" title="Configured sensors and dashboard are stored in this browser (localStorage)"> · Saved in this browser</span>
            )}
          </p>
        </div>
        <div className="top-bar-actions">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="top-bar-import-input"
            aria-label="Import dashboard JSON"
            onChange={handleImportFile}
          />
          <button type="button" className="btn-sm" onClick={() => importInputRef.current?.click()}>
            Import
          </button>
          <button type="button" className="btn-sm" onClick={openExportModal}>
            Export
          </button>
        </div>
      </header>

      {error && <div className="global-error">{error}</div>}

      {exportModalOpen && (
        <div className="modal-overlay" onClick={() => { setExportModalOpen(false); setExportDashboardName(''); }}>
          <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Export dashboard</h3>
            <div className="form-row">
              <label htmlFor="export-dashboard-name">Dashboard name (for file and JSON)</label>
              <input
                id="export-dashboard-name"
                type="text"
                value={exportDashboardName}
                onChange={(e) => setExportDashboardName(e.target.value)}
                placeholder="e.g. My production dashboard"
                autoFocus
              />
            </div>
            <p className="hint">File will be saved as sensoriqua-dashboard-[name]-[date].json</p>
            <div className="modal-actions">
              <button type="button" onClick={() => { setExportModalOpen(false); setExportDashboardName(''); }}>Cancel</button>
              <button type="button" className="btn-sm primary" onClick={() => exportDashboard(exportDashboardName)}>Export</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmDialog.title}</h3>
            <p className="confirm-message">{confirmDialog.message}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button
                type="button"
                className={confirmDialog.danger ? 'danger' : 'primary'}
                onClick={() => confirmDialog.onConfirm()}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {debugInfo && (
        <div className="modal-overlay debug-overlay" onClick={() => setDebugInfo(null)}>
          <div className="modal debug-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Debug: Add sensor failed</h3>
            <p className="debug-summary"><strong>Status:</strong> {debugInfo.status} {debugInfo.statusText}</p>
            <p className="debug-summary"><strong>Message:</strong> {debugInfo.errorMessage}</p>
            <div className="debug-section">
              <label>Request</label>
              <pre className="debug-pre">{debugInfo.method} {debugInfo.url}</pre>
              <pre className="debug-pre">{JSON.stringify(debugInfo.requestBody, null, 2)}</pre>
            </div>
            <div className="debug-section">
              <label>Response body</label>
              <pre className="debug-pre">{debugInfo.responseBody}</pre>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setDebugInfo(null)}>Close</button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                }}
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="main-layout">
        <aside className="left-panel">
          <AccordionStep
            step={1}
            title="Filter objects by grouping"
            open={openStep === 1}
            onToggle={() => setOpenStep((s) => (s === 1 ? 0 : 1))}
            badge={selectedGroupingIds.groups.length + selectedGroupingIds.tags.length + selectedGroupingIds.sensor_types.length || undefined}
          >
            <p className="step-desc">Filter by <strong>Group</strong>, <strong>Tag</strong>, and/or <strong>Sensor type</strong>. Select one or more — objects matching any selection appear in Step 2. Leave all empty to see all objects.</p>
            <div className="tabs">
              {(Object.keys(GROUPING_LABELS) as GroupingType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={groupingType === t ? 'tab active' : 'tab'}
                  onClick={() => setGroupingType(t)}
                >
                  {GROUPING_LABELS[t]}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={groupingSearch}
              onChange={(e) => setGroupingSearch(e.target.value)}
            />
            <div className="list-wrap">
              {loading === 'groupings' && <div className="loading">Loading…</div>}
              {groupingItems.map((g) => (
                <label key={g.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedGroupingIds[groupingType].includes(g.id)}
                    onChange={() => toggleGrouping(groupingType, g.id)}
                  />
                  {g.label}
                </label>
              ))}
            </div>
            <button type="button" className="btn-sm" onClick={() => clearGrouping(groupingType)}>Clear</button>
          </AccordionStep>

          <AccordionStep
            step={2}
            title="Choose objects"
            open={openStep === 2}
            onToggle={() => setOpenStep((s) => (s === 2 ? 0 : 2))}
            badge={filteredObjects.length > 0 ? filteredObjects.length : undefined}
          >
            <p className="step-desc">Objects from Step 1. View as full list or grouped by Group / Tag. Select objects to pick sensors in Step 3.</p>
            <div className="view-mode">
              <label className="view-mode-label">View:</label>
              <select
                value={objectListView}
                onChange={(e) => setObjectListView(e.target.value as typeof objectListView)}
              >
                <option value="full">Full list</option>
                <option value="groups">Grouped by Group</option>
                <option value="tags">Grouped by Tag</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Search objects..."
              value={objectsSearch}
              onChange={(e) => setObjectsSearch(e.target.value)}
            />
            {loading === 'objects' && <div className="loading">Loading…</div>}
            <div className="list-wrap objects-list object-list-grouped">
              {groupedObjects.map((grp) => (
                <div key={grp.key} className="object-group">
                  {objectListView !== 'full' && <div className="object-group__title">{grp.label}</div>}
                  {grp.items.map((o) => (
                    <label key={o.id} className="checkbox-row">
                      <input type="checkbox" checked={selectedObjectIds.includes(o.id)} onChange={() => toggleObject(o.id)} />
                      {o.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="meta">Showing {filteredObjects.length} objects</div>
            {filteredObjects.length === 0 && objects.length === 0 && !loading && (
              <p className="hint">No objects loaded. Check connection and Step 1 filters (or leave Group/Tag empty to load all).</p>
            )}
            <div className="step-actions">
              <button type="button" className="btn-sm" onClick={() => loadObjects()}>Refresh list</button>
              <button type="button" className="btn-sm" onClick={selectAllObjects}>Select all filtered</button>
            </div>
          </AccordionStep>

          <AccordionStep
            step={3}
            title="Sensors &amp; configure"
            open={openStep === 3}
            onToggle={() => setOpenStep((s) => (s === 3 ? 0 : 3))}
            badge={selectedObjectIds.length > 0 ? selectedObjectIds.length : undefined}
          >
            <p className="step-desc">For each selected object you can add one or more sensors. Choose a sensor, set display label and MIN/MAX, then Add to configured list.</p>
            {selectedObjectIds.length === 0 && <p className="hint">Select objects in Step 2 first.</p>}
            {selectedObjectIds.map((objectId) => {
              const obj = objects.find((o) => o.id === objectId);
              if (!obj) return null;
              const allSensors = sensorsByObject[objectId] || [];
              const selectedTypes = selectedGroupingIds.sensor_types;
              const sensors = selectedTypes.length === 0
                ? allSensors
                : allSensors.filter((s) => {
                    const source = s.source ?? 'input';
                    const st = s.sensor_type ?? null;
                    return selectedTypes.some((t) => {
                      if (t === 'state') return source === 'state';
                      if (t === 'tracking') return source === 'tracking';
                      return source === 'input' && st != null && String(st) === String(t);
                    });
                  });
              const slots = selectedSensorsByObject[objectId] ?? [{ sensor: null, device_id: obj.device_id }];
              return (
                <div key={objectId} className="object-sensors-block">
                  {slots.map((slot, idx) => (
                    <div key={`${objectId}-${idx}`} className="object-sensor-row">
                      <div className="obj-name">{idx === 0 ? obj.label : '\u00A0'}</div>
                      <select
                        value={slot.sensor ? `${slot.sensor.source ?? 'input'}:${slot.sensor.input_label}` : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) {
                            setSelectedSensorsByObject((prev) => ({
                              ...prev,
                              [objectId]: (prev[objectId] ?? []).map((sl, i) => i === idx ? { ...sl, sensor: null } : sl),
                            }));
                            return;
                          }
                          const [source, inputLabel] = v.includes(':') ? v.split(/:(.*)/).filter(Boolean) : ['input', v];
                          const s = sensors.find((x) => (x.source ?? 'input') === source && x.input_label === inputLabel);
                          if (s) setSelectedSensorsByObject((prev) => ({
                            ...prev,
                            [objectId]: (prev[objectId] ?? []).map((sl, i) => i === idx ? { ...sl, sensor: s } : sl),
                          }));
                        }}
                      >
                        <option value="">Select sensor</option>
                        {sensors.map((s) => (
                          <option key={`${s.source ?? 'input'}:${s.input_label}`} value={`${s.source ?? 'input'}:${s.input_label}`}>
                            {s.label || s.input_label} ({s.source ?? 'input'})
                            {s.sensor_type || s.sensor_units ? ` · ${[s.sensor_type, s.sensor_units].filter(Boolean).join(' · ')}` : ''}
                          </option>
                        ))}
                      </select>
                      {slot.sensor?.description_parameters && slot.sensor.description_parameters.length > 0 && (
                        <div className="sensor-params">
                          {slot.sensor.description_parameters.map((p, i) => (
                            <span key={i} className="sensor-param">{p.name}: {String(p.value)}</span>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn-sm primary"
                        disabled={!slot.sensor}
                        onClick={() => slot.sensor && openConfigModal(obj, slot.sensor)}
                      >
                        Configure / Add
                      </button>
                    </div>
                  ))}
                  <div className="object-sensor-row object-sensor-add-row">
                    <div className="obj-name" />
                    <button type="button" className="btn-sm" onClick={() => addSensorSlot(objectId, obj.device_id)}>
                      + Add sensor for this object
                    </button>
                  </div>
                </div>
              );
            })}
          </AccordionStep>
        </aside>

        <div className="center-panel">
          <section className="configured-section">
            <h4>Configured sensors</h4>
            <div className="configured-cards">
              {configured.map((c) => {
                const key = sparkKey(c.device_id, c.sensor_input_label, c.sensor_source || 'input');
                const data = sparklineData[key] || [];
                const isOnDashboard = dashboardPlanes.some((p) => p.configured_sensor_id === c.configured_sensor_id);
                return (
                  <div key={c.configured_sensor_id} className={`configured-card${isOnDashboard ? ' configured-card-on-dashboard' : ''}`}>
                    <div className="card-main">
                      <div className="card-header">
                        <span className="obj-label">{c.object_label}</span>
                        <span className="sensor-label">{c.sensor_label_custom}</span>
                      </div>
                      <div className="spark-wrap">
                        <Sparkline
                          data={data}
                          width={100}
                          height={24}
                          showThresholds
                          min={c.min_threshold}
                          max={c.max_threshold}
                        />
                      </div>
                    </div>
                    <div className="card-actions">
                      <button type="button" className="card-action-btn" onClick={() => openEditModal(c)} title="Edit" aria-label="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button
                        type="button"
                        className={`card-action-btn${isOnDashboard ? ' on-dashboard' : ''}`}
                        onClick={() => !isOnDashboard && addToDashboard(c.configured_sensor_id)}
                        title={isOnDashboard ? 'On dashboard' : 'Add to dashboard'}
                        aria-label={isOnDashboard ? 'On dashboard' : 'Add to dashboard'}
                        disabled={isOnDashboard}
                      >
                        {isOnDashboard ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                        )}
                      </button>
                      <button type="button" className="card-action-btn danger" onClick={() => handleRemoveConfigured(c.configured_sensor_id)} title="Remove" aria-label="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h4>Dashboard</h4>
            <div className="dashboard-update-duration">
              <label>Update every</label>
              <select
                value={dashboardUpdateSeconds}
                onChange={(e) => setDashboardUpdateSeconds(Number(e.target.value))}
                aria-label="Dashboard update interval"
              >
                <option value={30}>30 sec</option>
                <option value={60}>1 min</option>
                <option value={300}>5 min</option>
              </select>
            </div>
          </div>
          <p className="hint">Sensors added from the list appear here. Values update periodically.</p>
          <div className="dashboard-grid">
            {dashboardPlanes.map((p) => {
              const key = sparkKey(p.device_id, p.sensor_input_label, p.sensor_source || 'input');
              const latest = dashboardValues[key];
              const val = latest?.value ?? null;
              const ok = inThreshold(val, p.min_threshold, p.max_threshold);
              const data = sparklineData[key] || [];
              return (
                <div
                  key={p.dashboard_plane_id}
                  className="dashboard-plane"
                  data-ok={ok}
                  role="button"
                  tabIndex={0}
                  onClick={() => setHistoryPlane(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHistoryPlane(p); } }}
                  title="Click to view history"
                >
                  <button
                    type="button"
                    className="plane-close"
                    onClick={(e) => { e.stopPropagation(); confirmRemoveFromDashboard(p); }}
                    title="Remove from dashboard"
                    aria-label="Remove from dashboard"
                  >
                    ×
                  </button>
                  <div className="plane-header">
                    <span className="obj-label">{p.object_label}</span>
                    <span className="sensor-label">{p.sensor_label_custom}</span>
                  </div>
                  <div className="plane-value">
                    {val != null ? val.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
                  </div>
                  <div className="plane-ts">{latest?.ts ? new Date(latest.ts).toLocaleString() : '—'}</div>
                  <div className="plane-spark">
                    <Sparkline data={data} width={160} height={36} showThresholds min={p.min_threshold} max={p.max_threshold} stroke={ok ? '#22c55e' : '#ef4444'} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {historyPlane && (
        <div className="modal-overlay" onClick={() => setHistoryPlane(null)}>
          <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>Sensor history — {historyPlane.object_label} · {historyPlane.sensor_label_custom}</h3>
              <button type="button" className="modal-close" onClick={() => setHistoryPlane(null)} aria-label="Close">×</button>
            </div>
            <div className="form-row">
              <label htmlFor="history-duration">Duration</label>
              <select
                id="history-duration"
                value={historyDurationHours}
                onChange={(e) => setHistoryDurationHours(Number(e.target.value) as api.SensorHistoryHours)}
                aria-label="Time range"
              >
                <option value={1}>Last 1 hour</option>
                <option value={4}>Last 4 hours</option>
                <option value={12}>Last 12 hours</option>
                <option value={24}>Last 24 hours</option>
              </select>
            </div>
            <div className="history-chart-wrap">
              {historyLoading ? (
                <p className="hint">Loading…</p>
              ) : (
                <HistoryChart
                  data={historyData}
                  width={560}
                  height={260}
                  showThresholds
                  min={historyPlane.min_threshold}
                  max={historyPlane.max_threshold}
                />
              )}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setHistoryPlane(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {configModal && (
        <ConfigModal
          initial={configModal}
          isEdit={editingConfigId != null}
          onSave={handleConfigSave}
          onCancel={() => { setConfigModal(null); setEditingConfigId(null); }}
        />
      )}
    </div>
  );
}
