import { Ionicons } from "@expo/vector-icons";
import { accountName } from '@/services/account-identity';
import { KeyboardForm, FormScrollView } from '@/components/keyboard-form';
import { subscribeAuth, loginDatabase, logoutDatabase, type DatabaseUser as User } from '@/services/firebase/rtdb-auth';
import { router } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  adminError,
  loadAdmin,
  loadLedger,
  loadReport,
  saveAdmin,
  subscribeAdminUpdates,
} from "@/services/admin/service";
import PlatformAdminPanel from "./platform-admin-panel";
import {
  alertStatuses,
  csv,
  dateKey,
  deviceState,
  growth,
  isMaintenance,
  money,
  rangeFor,
  roles,
  states,
  total,
  validRange,
  type AdminReport,
  type AdminSnapshot,
  type LedgerEntry,
} from "@/services/admin/model";

const light = {
  bg: "#F4F6FA",
  surface: "#FFFFFF",
  text: "#18243C",
  muted: "#6F7B91",
  line: "#E6EBF2",
  accent: "#5264E8",
  soft: "#EEF0FF",
};
const dark = {
  bg: "#101725",
  surface: "#1A2436",
  text: "#EEF2FF",
  muted: "#9CAAC3",
  line: "#2D3950",
  accent: "#9BA7FF",
  soft: "#293354",
};
const Theme = createContext(light);
const tabs = [
  { id: "overview", title: "Tổng quan", icon: "grid-outline" },
  { id: "platform", title: "Game · Thẻ · Hỗ trợ", icon: "chatbubbles-outline" },
  { id: "devices", title: "Thiết bị", icon: "game-controller-outline" },
  { id: "alerts", title: "Cảnh báo", icon: "notifications-outline" },
  { id: "revenue", title: "Doanh thu", icon: "bar-chart-outline" },
  { id: "transactions", title: "Giao dịch", icon: "receipt-outline" },
  { id: "branches", title: "Chi nhánh", icon: "business-outline" },
  { id: "maintenance", title: "Bảo trì", icon: "construct-outline" },
  { id: "users", title: "Phân quyền admin", icon: "people-outline" },
  { id: "audit", title: "Nhật ký", icon: "time-outline" },
  { id: "settings", title: "Cài đặt", icon: "settings-outline" },
] as const;
type Tab = (typeof tabs)[number]["id"];
type Editor = {
  title: string;
  action: string;
  id: string;
  fields: {
    key: string;
    label: string;
    choices?: { value: string; label: string }[];
    numeric?: boolean;
  }[];
  values: Record<string, string>;
};
function Label({
  children,
  muted = false,
  size = 14,
  bold = false,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: number;
  bold?: boolean;
}) {
  const c = useContext(Theme);
  return (
    <Text
      style={{
        color: muted ? c.muted : c.text,
        fontSize: size,
        fontWeight: bold ? "700" : "400",
        lineHeight: size * 1.5,
      }}
    >
      {children}
    </Text>
  );
}
function Button({
  title,
  onPress,
  primary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const c = useContext(Theme);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          borderColor: c.line,
          backgroundColor: primary ? "#5264E8" : c.surface,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: primary ? "#FFFFFF" : c.text,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) {
  const c = useContext(Theme);
  return (
    <TextInput
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      style={[
        s.input,
        { color: c.text, backgroundColor: c.bg, borderColor: c.line },
      ]}
    />
  );
}
function Panel({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const c = useContext(Theme);
  return (
    <View
      style={[s.panel, { backgroundColor: c.surface, borderColor: c.line }]}
    >
      {title && (
        <Label size={17} bold>
          {title}
        </Label>
      )}
      {subtitle && (
        <Label muted size={12}>
          {subtitle}
        </Label>
      )}
      {children}
    </View>
  );
}
function Badge({ title, tone = "neutral" }: { title: string; tone?: string }) {
  const color =
    tone === "good"
      ? "#168B68"
      : tone === "bad"
        ? "#D85161"
        : tone === "warn"
          ? "#BA7C13"
          : "#7182AD";
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 8,
        paddingHorizontal: 9,
        paddingVertical: 4,
        backgroundColor: `${color}18`,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{title}</Text>
    </View>
  );
}
function Chips({
  values,
  value,
  onChange,
}: {
  values: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const c = useContext(Theme);
  return (
    <View style={s.wrap}>
      {values.map((v) => (
        <Pressable
          key={v.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === v.value }}
          onPress={() => onChange(v.value)}
          style={[
            s.chip,
            {
              backgroundColor: value === v.value ? c.soft : c.surface,
              borderColor: value === v.value ? c.accent : c.line,
            },
          ]}
        >
          <Text
            style={{
              color: value === v.value ? c.accent : c.muted,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {v.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function time(value: number) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export default function AdminApp() {
  const [isDark, setDark] = useState(false);
  return (
    <Theme.Provider value={isDark ? dark : light}>
      <AdminContent isDark={isDark} onTheme={() => setDark((v) => !v)} />
    </Theme.Provider>
  );
}
function AdminContent({
  isDark,
  onTheme,
}: {
  isDark: boolean;
  onTheme: () => void;
}) {
  const c = useContext(Theme);
  const { width } = useWindowDimensions();
  const wide = width >= 1050;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [branch, changeBranch] = useState("");
  const [device, changeDevice] = useState("");
  const [search, changeSearch] = useState("");
  const [status, changeStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [range, setRange] = useState(() => rangeFor("month"));
  const [draftStart, setDraftStart] = useState(range.start);
  const [draftEnd, setDraftEnd] = useState(range.end);
  const [period, setPeriod] = useState("month");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const dataRequest = useRef(0);
  const reportRequest = useRef(0);
  const ledgerRequest = useRef(0);
  useEffect(
    () => {
      return subscribeAuth((value) => {
        generation.current++;
        setUser(value);
        setData(null);
        setReport(null);
        setEntries([]);
        setAuthReady(true);
      });
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (!user) return;
    const g = generation.current;
    const request = ++dataRequest.current;
    try {
      const value = await loadAdmin();
      if (g === generation.current && request === dataRequest.current) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (g === generation.current && request === dataRequest.current) {
        setError(adminError(e));
        setData(null);
      }
    }
  }, [user]);
  // Only the latest authenticated request may update the snapshot.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = user ? subscribeAdminUpdates(() => {
      clearTimeout(pending);
      pending = setTimeout(() => { setNow(Date.now()); void refresh(); }, 100);
    }, (e) => setError(adminError(e))) : () => {};
    const requestToken = dataRequest;
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(pending);
      unsubscribe();
      requestToken.current++;
    };
  }, [refresh, user]);
  const canFinance =
    !!data &&
    ["super_admin", "accountant", "viewer"].includes(data.access.role);
  const financeVisible = tab === "overview" || tab === "revenue";
  useEffect(() => {
    const request = ++reportRequest.current;
    const g = generation.current;
    // Reset the previous query immediately so a new filter cannot display old financial totals.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(null);
    setReportError("");
    if (!canFinance || !financeVisible) return;
    let active = true;
    const read = async () => {
      try {
        const result = await loadReport(range.start, range.end, branch, device);
        if (
          active &&
          g === generation.current &&
          request === reportRequest.current
        )
          setReport(result);
      } catch (e) {
        if (active && g === generation.current) setReportError(adminError(e));
      }
    };
    void read();
    return () => {
      active = false;
    };
  }, [
    canFinance,
    financeVisible,
    range,
    branch,
    device,
    data?.updatedAt,
  ]);
  const readLedger = useCallback(
    async (next?: string) => {
      const g = generation.current;
      const request = ++ledgerRequest.current;
      setBusy(true);
      try {
        const result = await loadLedger(next);
        if (g === generation.current && request === ledgerRequest.current) {
          setEntries((old) =>
            next
              ? [
                  ...old,
                  ...result.rows.filter(
                    (row) => !old.some((item) => item.id === row.id),
                  ),
                ]
              : result.rows,
          );
          setCursor(result.next);
          setError("");
        }
      } catch (e) {
        if (g === generation.current) setError(adminError(e));
      } finally {
        if (g === generation.current) setBusy(false);
      }
    },
    [],
  );
  // Fetch the first ledger page on entry; request/generation guards prevent stale responses.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "transactions" && canFinance) void readLedger();
  }, [tab, canFinance, readLedger]);
  const setBranch = (value: string) => {
    changeBranch(value);
    changeDevice("");
    setPage(0);
  };
  const setDevice = (value: string) => {
    changeDevice(value);
    setPage(0);
  };
  const setSearch = (value: string) => {
    changeSearch(value);
    setPage(0);
  };
  const setStatus = (value: string) => {
    changeStatus(value);
    setPage(0);
  };
  const navigate = (value: Tab) => {
    setTab(value);
    setSearch("");
    setStatus("all");
    setNotice("");
  };
  const deviceList = (data?.devices ?? []).filter(
    (d) => (!branch || d.branchId === branch) && (!device || d.id === device),
  );
  const matching = (value: string) =>
    value.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi"));
  const branchName = (id: string) =>
    data?.branches.find((b) => b.id === id)?.name ??
    (id || "Chưa gán chi nhánh");
  const filteredDevices = deviceList.filter((d) => {
    const state = deviceState(d, now, data?.settings.offlineSeconds ?? 120);
    return (
      matching(`${d.id} ${d.name}`) &&
      (status === "all" ||
        (status === "connected"
          ? ["online", "playing", "maintenance", "error"].includes(state)
          : state === status))
    );
  });
  const counts = Object.fromEntries(
    Object.keys(states).map((key) => [
      key,
      deviceList.filter(
        (d) =>
          deviceState(d, now, data?.settings.offlineSeconds ?? 120) === key,
      ).length,
    ]),
  );
  const scopedAlerts = (data?.alerts ?? []).filter((a) =>
    deviceList.some((d) => d.id === a.deviceId),
  );
  const unresolved = scopedAlerts.filter((a) => a.status !== "resolved");
  const metrics = useMemo(() => total(report?.days ?? []), [report]);
  const canOperate =
    !!data &&
    ["super_admin", "operations", "technician"].includes(data.access.role);
  const canManage =
    !!data && ["super_admin", "operations"].includes(data.access.role);
  const isSuper = data?.access.role === "super_admin";
  const visibleTabs = tabs.filter(
    (t) =>
      !(["revenue", "transactions"].includes(t.id) && !canFinance) &&
      !(t.id === "users" && !isSuper) &&
      !(t.id === "audit" && !canManage),
  );
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      await loginDatabase(email, password);
      setPassword("");
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await logoutDatabase();
      router.replace("/login");
      setError("");
      setBranch("");
      setDevice("");
      setTab("overview");
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  const choosePeriod = (value: string) => {
    setPeriod(value);
    if (value !== "custom") {
      const r = rangeFor(value as "day" | "month" | "year");
      setRange(r);
      setDraftStart(r.start);
      setDraftEnd(r.end);
    }
  };
  const openEditor = (
    title: string,
    action: string,
    id: string,
    fields: Editor["fields"],
    values: Record<string, string>,
  ) => {
    setNotice("");
    setEditor({ title, action, id, fields, values });
  };
  const submit = async () => {
    if (!editor || !data) return;
    const g = generation.current;
    setBusy(true);
    setNotice("");
    try {
      const value: Record<string, unknown> = { ...editor.values };
      for (const field of editor.fields)
        if (field.numeric) {
          const n = Number(value[field.key]);
          if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`${field.label} phải là số nguyên không âm.`);
          value[field.key] = n;
        }
      if (
        editor.action === "settings" &&
        (Number(value.offlineSeconds) < 30 ||
          Number(value.offlineSeconds) > 3600)
      )
        throw new Error("Ngưỡng mất kết nối phải từ 30 đến 3600 giây.");
      if (
        editor.action === "maintenance" &&
        !validRange(String(value.dueDate), String(value.dueDate))
      )
        throw new Error("Ngày bảo trì phải có dạng YYYY-MM-DD hợp lệ.");
      if (editor.action === "maintenance")
        value.completed = value.completed === "true";
      {
        await saveAdmin(editor.action, editor.id, value, value.revoke === 'true');
        if (g !== generation.current) return;
        await refresh();
      }
      setEditor(null);
      setNotice("Đã lưu thay đổi và nhật ký quản trị.");
    } catch (e) {
      setNotice(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  const exportRows = async (rows: (string | number)[][], name: string) => {
    try {
      const content = csv(rows);
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([content], { type: "text/csv;charset=utf-8;" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ message: content, title: name });
    } catch (e) {
      setNotice(adminError(e));
    }
  };
  const branchChoices = [
    { value: "", label: "Chưa gán" },
    ...(data?.branches ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
  const deviceChoices = (data?.devices ?? []).map((d) => ({
    value: d.id,
    label: `${d.id} · ${d.name}`,
  }));
  const deviceRows = (rows: typeof deviceList) =>
    rows.map((d) => {
      const state = deviceState(d, now, data?.settings.offlineSeconds ?? 120);
      return (
        <Pressable
          key={d.id}
          accessibilityRole="button"
          onPress={() =>
            openEditor(
              `Thiết bị ${d.id}`,
              "device",
              d.id,
              canManage
                ? [
                    { key: "name", label: "Tên thiết bị" },
                    {
                      key: "branchId",
                      label: "Chi nhánh",
                      choices: branchChoices,
                    },
                    { key: "note", label: "Ghi chú" },
                  ]
                : [],
              {
                name: d.name,
                branchId: d.branchId,
                note: d.note ?? "",
                firmware: d.firmware ?? "Chưa có",
                heartbeat: d.lastSeenEpoch
                  ? time(d.lastSeenEpoch * 1000)
                  : "Chưa đồng bộ",
                ipAddress: d.ipAddress ?? "Chưa có",
                wifi: d.wifiRSSI ? `${d.wifiRSSI} dBm` : "Chưa có",
              },
            )
          }
          style={[s.tableRow, { borderColor: c.line }]}
        >
          <View style={s.grow}>
            <Label bold>{d.name}</Label>
            <Label muted size={12}>
              {d.id} · {branchName(d.branchId)}
            </Label>
          </View>
          <Badge
            title={states[state]}
            tone={
              state === "error"
                ? "bad"
                : state === "offline" || state === "unknown" || state === "maintenance"
                  ? "warn"
                  : "good"
            }
          />
          <Ionicons name="chevron-forward" color={c.muted} size={16} />
        </Pressable>
      );
    });
  const pager = (count: number) => (
    <View style={s.row}>
      <Label muted size={12}>
        {count} kết quả · Trang {page + 1}/{Math.max(1, Math.ceil(count / 10))}
      </Label>
      <Button
        title="Trước"
        disabled={page === 0}
        onPress={() => setPage((p) => p - 1)}
      />
      <Button
        title="Sau"
        disabled={(page + 1) * 10 >= count}
        onPress={() => setPage((p) => p + 1)}
      />
    </View>
  );
  const empty = (count: number) =>
    !count ? (
      <View style={{ padding: 22 }}>
        <Label muted>Chưa có dữ liệu phù hợp với bộ lọc.</Label>
      </View>
    ) : null;
  const metricCard = (
    title: string,
    value: string,
    caption: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    onPress: () => void,
    color: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.metric, { backgroundColor: c.surface, borderColor: c.line }]}
    >
      <View style={s.between}>
        <Label muted size={12}>
          {title}
        </Label>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <Label size={28} bold>
        {value}
      </Label>
      <Label muted size={11}>
        {caption}
      </Label>
    </Pressable>
  );
  const bars = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const d of report?.days ?? []) {
      const key = (report?.days.length ?? 0) > 45 ? d.day.slice(0, 7) : d.day;
      grouped.set(key, (grouped.get(key) ?? 0) + d.gross - d.refunds);
    }
    return [...grouped].map(([label, value]) => ({ label, value }));
  }, [report]);
  const chart = (
    <Panel
      title="Biến động doanh thu"
      subtitle="Doanh thu sau hoàn tiền · VND · Asia/Ho_Chi_Minh"
    >
      {report ? (
        report.updatedAt ? (
          <>
            <ScrollView horizontal>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  height: 220,
                  gap: 9,
                  paddingTop: 20,
                }}
              >
                {bars.map((b, i) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${b.label}: ${money(b.value)}`}
                    key={b.label}
                    onPress={() => setNotice(`${b.label}: ${money(b.value)}`)}
                    style={{
                      alignItems: "center",
                      width: bars.length > 15 ? 30 : 48,
                      justifyContent: "flex-end",
                      height: 200,
                    }}
                  >
                    <View
                      style={{
                        height: Math.max(
                          3,
                          (Math.abs(b.value) /
                            Math.max(
                              1,
                              ...bars.map((v) => Math.abs(v.value)),
                            )) *
                            150,
                        ),
                        width: "70%",
                        borderRadius: 5,
                        backgroundColor:
                          b.value < 0
                            ? "#DC6976"
                            : i === bars.length - 1
                              ? "#5264E8"
                              : isDark
                                ? "#485581"
                                : "#BEC6FA",
                      }}
                    />
                    <Label muted size={10}>
                      {b.label.slice(5)}
                    </Label>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Label muted size={11}>
              Chạm một cột để xem giá trị. Cột đỏ thể hiện giá trị âm.
            </Label>
          </>
        ) : (
          <Label muted>
            Chưa có giao dịch trên Realtime Database trong khoảng thời gian này.
          </Label>
        )
      ) : (
        <Label muted>{reportError || "Đang tải báo cáo…"}</Label>
      )}
    </Panel>
  );

  if (!authReady)
    return (
      <SafeAreaView style={[s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  if (!user)
    return (
      <SafeAreaView style={[s.center, { backgroundColor: c.bg }]}>
        <KeyboardForm>
        <FormScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View style={{ width: Math.min(width - 48, 440), gap: 18 }}>
            <Ionicons name="grid" size={38} color={c.accent} />
            <Label size={30} bold>
              SmartPlaycard Admin
            </Label>
            <Label muted>Không gian quản trị thiết bị và kinh doanh.</Label>
            <Panel title="Đăng nhập quản trị">
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="Tên tài khoản quản trị"
              />
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Mật khẩu"
                secureTextEntry
              />
              {error ? <Label>{error}</Label> : null}
              <Button
                title={busy ? "Đang đăng nhập…" : "Đăng nhập"}
                primary
                disabled={busy || !email || !password}
                onPress={() => void login()}
              />
              <Label muted size={12}>
                Sử dụng tài khoản trong Realtime Database đã được cấp quyền admin.
              </Label>
            </Panel>
            <Button
              title="Ứng dụng người dùng"
              onPress={() => router.replace("/login")}
            />
          </View>
        </FormScrollView>
        </KeyboardForm>
      </SafeAreaView>
    );

  const navigation = (
    <>
      {visibleTabs.map((t) => (
        <Pressable
          key={t.id}
          accessibilityLabel={t.title}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === t.id }}
          onPress={() => navigate(t.id)}
          style={[
            s.navItem,
            { backgroundColor: tab === t.id ? c.soft : "transparent" },
          ]}
        >
          <Ionicons
            name={t.icon}
            size={20}
            color={tab === t.id ? c.accent : c.muted}
          />
          <Text
            style={{
              color: tab === t.id ? c.accent : c.muted,
              fontWeight: tab === t.id ? "700" : "500",
              fontSize: 14,
            }}
          >
            {t.title}
          </Text>
          {t.id === "alerts" && unresolved.length > 0 && (
            <Badge title={String(unresolved.length)} tone="bad" />
          )}
          {t.id === "maintenance" && deviceList.some(isMaintenance) && (
            <Badge title={String(deviceList.filter(isMaintenance).length)} tone="warn" />
          )}
          {t.id === 'platform' && !!data?.supportCount && <Badge title={String(data.supportCount)} tone="bad" />}
        </Pressable>
      ))}
    </>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardForm>
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
        {wide && (
          <View
            style={[
              s.sidebar,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <View style={{ gap: 6, padding: 16, paddingBottom: 30 }}>
              <Ionicons name="grid" size={30} color={c.accent} />
              <Label size={20} bold>
                SmartPlaycard
              </Label>
              <Label muted size={11}>
                ADMIN WORKSPACE
              </Label>
            </View>
            <ScrollView>{navigation}</ScrollView>
            <View style={{ padding: 12, gap: 10 }}>
              <Badge
                title={
                  roles[data?.access.role ?? "viewer"]
                }
              />
              <Label muted size={11}>
                {accountName(user?.email)}
              </Label>
              <Button title="Đăng xuất" onPress={() => void logout()} />
            </View>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View
            style={[
              s.header,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <View style={[s.grow, width < 600 && { flexBasis: "100%" }]}>
              <Label muted size={11}>
                WORKSPACE /{" "}
                {tabs.find((t) => t.id === tab)?.title.toUpperCase()}
              </Label>
              <Label size={20} bold>
                {tabs.find((t) => t.id === tab)?.title}
              </Label>
            </View>
            <Button title={isDark ? "☀ Sáng" : "☾ Tối"} onPress={onTheme} />
            <Button
              title="Làm mới"
              disabled={busy}
              onPress={() => {
                void refresh();
                if (tab === "transactions") void readLedger();
              }}
            />
            {!wide && <Button title="Thoát" onPress={() => void logout()} />}
          </View>
          {!wide && (
            <View style={{ backgroundColor: c.surface }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12 }}
              >
                {navigation}
              </ScrollView>
            </View>
          )}
          <FormScrollView
            contentContainerStyle={{
              padding: wide ? 28 : 16,
              gap: 20,
              paddingBottom: 60,
            }}
          >
            {error ? (
              <Panel title="Không thể tải dữ liệu">
                <Label>{error}</Label>
                <Button title="Thử lại" onPress={() => void refresh()} />
              </Panel>
            ) : null}
            {notice && !editor ? (
              <Pressable
                onPress={() => setNotice("")}
                style={[s.banner, { backgroundColor: c.soft }]}
              >
                <Label>{notice}</Label>
              </Pressable>
            ) : null}
            {!data && !error ? <ActivityIndicator color={c.accent} /> : null}
            {data && (
              <>
                {tab === "platform" && <PlatformAdminPanel colors={c} />}
                <View style={s.between}>
                  <View style={s.grow}>
                    <Label size={26} bold>
                      {tab === "overview"
                        ? "Bức tranh vận hành hôm nay"
                        : tabs.find((t) => t.id === tab)?.title}
                    </Label>
                    <Label muted size={12}>
                      Dữ liệu thật · Cập
                      nhật {time(data.updatedAt)} · Tự làm mới mỗi 30 giây
                    </Label>
                  </View>
                  <Badge
                    title={
                      now - data.updatedAt > 90000
                        ? "Dữ liệu cũ"
                        : "Đã đồng bộ"
                    }
                    tone={now - data.updatedAt > 90000 ? "warn" : "good"}
                  />
                </View>
                {[
                  "overview",
                  "devices",
                  "alerts",
                  "revenue",
                  "transactions",
                  "maintenance",
                ].includes(tab) && (
                  <Panel>
                    <Chips
                      value={branch}
                      onChange={(v) => {
                        setBranch(v);
                        setDevice("");
                      }}
                      values={[
                        { value: "", label: "Tất cả chi nhánh" },
                        ...data.branches.map((b) => ({
                          value: b.id,
                          label: b.name,
                        })),
                      ]}
                    />
                    <ScrollView horizontal>
                      <Chips
                        value={device}
                        onChange={setDevice}
                        values={[
                          { value: "", label: "Tất cả thiết bị" },
                          ...data.devices
                            .filter((d) => !branch || d.branchId === branch)
                            .map((d) => ({ value: d.id, label: d.id })),
                        ]}
                      />
                    </ScrollView>
                  </Panel>
                )}
                {financeVisible && canFinance && (
                  <View style={s.wrap}>
                    <Chips
                      value={period}
                      onChange={choosePeriod}
                      values={[
                        { value: "day", label: "Hôm nay" },
                        { value: "month", label: "Tháng này" },
                        { value: "year", label: "Năm nay" },
                        { value: "custom", label: "Tùy chọn" },
                      ]}
                    />
                    {period === "custom" && (
                      <View style={s.wrap}>
                        <Input
                          value={draftStart}
                          onChangeText={setDraftStart}
                          placeholder="Từ YYYY-MM-DD"
                        />
                        <Input
                          value={draftEnd}
                          onChangeText={setDraftEnd}
                          placeholder="Đến YYYY-MM-DD"
                        />
                        <Button
                          title="Áp dụng"
                          onPress={() => {
                            if (!validRange(draftStart, draftEnd)) {
                              setNotice("Chọn ngày hợp lệ, tối đa 366 ngày.");
                              return;
                            }
                            setRange({ start: draftStart, end: draftEnd });
                          }}
                        />
                      </View>
                    )}
                    <Label muted size={12}>
                      {range.start} → {range.end}
                    </Label>
                  </View>
                )}
                {tab === "overview" && (
                  <>
                    <View style={s.wrap}>
                      {metricCard(
                        "Tổng thiết bị",
                        String(deviceList.length),
                        `${counts.unknown} chưa đồng bộ thời gian`,
                        "hardware-chip-outline",
                        () => navigate("devices"),
                        "#5264E8",
                      )}
                      {metricCard(
                        "Thiết bị online",
                        String(counts.online + counts.playing + counts.error),
                        `${counts.playing} đang sử dụng · ${counts.maintenance} bảo trì · ${counts.offline} offline`,
                        "pulse-outline",
                        () => {
                          navigate("devices");
                          setStatus("connected");
                        },
                        "#159976",
                      )}
                      {metricCard(
                        "Cảnh báo chưa xử lý",
                        String(unresolved.length),
                        `${unresolved.filter((a) => a.severity === "critical").length} mức nghiêm trọng`,
                        "warning-outline",
                        () => navigate("alerts"),
                        "#D98A35",
                      )}
                      {canFinance &&
                        metricCard(
                          "Doanh thu trong kỳ",
                          report?.updatedAt
                            ? money(metrics.gross - metrics.refunds)
                            : "—",
                          report?.updatedAt
                            ? growth(
                                metrics.gross - metrics.refunds,
                                report.previous.gross - report.previous.refunds,
                              )
                            : "Chờ dữ liệu xác nhận",
                          "wallet-outline",
                          () => navigate("revenue"),
                          "#8261D8",
                        )}
                    </View>
                    {canFinance && chart}
                    <View style={s.columns}>
                      <View style={s.column}>
                        <Panel
                          title="Thiết bị gần đây"
                          subtitle="Trạng thái dựa trên heartbeat và phiên sử dụng"
                        >
                          {deviceRows(deviceList.slice(0, 5))}
                          {empty(deviceList.length)}
                          <Button
                            title="Xem tất cả thiết bị"
                            onPress={() => navigate("devices")}
                          />
                        </Panel>
                      </View>
                      <View style={s.column}>
                        <Panel
                          title="Cần chú ý"
                          subtitle="Cảnh báo ưu tiên xử lý"
                        >
                          {unresolved.slice(0, 4).map((a) => (
                            <Pressable
                              key={a.id}
                              onPress={() => navigate("alerts")}
                              style={[s.tableRow, { borderColor: c.line }]}
                            >
                              <View style={s.grow}>
                                <Label bold>{a.title}</Label>
                                <Label muted size={12}>
                                  {a.deviceId} · {a.updatedAt > 0 ? time(a.updatedAt) : "Chưa đồng bộ thời gian"}
                                </Label>
                              </View>
                              <Badge
                                title={
                                  a.severity === "critical"
                                    ? "Nghiêm trọng"
                                    : "Cảnh báo"
                                }
                                tone={
                                  a.severity === "critical" ? "bad" : "warn"
                                }
                              />
                            </Pressable>
                          ))}
                          {empty(unresolved.length)}
                        </Panel>
                      </View>
                    </View>
                  </>
                )}
                {tab === "devices" && (
                  <Panel title="Danh sách thiết bị">
                    <Input
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Tìm mã hoặc tên thiết bị…"
                    />
                    <Chips
                      value={status}
                      onChange={setStatus}
                      values={[
                        { value: "all", label: "Tất cả" },
                        { value: "connected", label: "Đang kết nối" },
                        ...Object.entries(states).map(([value, label]) => ({
                          value,
                          label,
                        })),
                      ]}
                    />
                    {deviceRows(
                      filteredDevices.slice(page * 10, page * 10 + 10),
                    )}
                    {empty(filteredDevices.length)}
                    {pager(filteredDevices.length)}
                    <Label muted size={12}>
                      Thiết bị chưa đồng bộ giờ không được coi là online.
                      Firmware cần gửi playing hoặc status=playing để xác định
                      đang sử dụng.
                    </Label>
                  </Panel>
                )}
                {tab === "alerts" && (
                  <Panel title="Trung tâm cảnh báo">
                    <Input
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Tìm mã thiết bị hoặc nội dung lỗi…"
                    />
                    <Chips
                      value={status}
                      onChange={setStatus}
                      values={[
                        { value: "all", label: "Tất cả" },
                        ...Object.entries(alertStatuses).map(
                          ([value, label]) => ({ value, label }),
                        ),
                      ]}
                    />
                    {(() => {
                      const rows = scopedAlerts.filter(
                        (a) =>
                          matching(`${a.title} ${a.deviceId}`) &&
                          (status === "all" || a.status === status),
                      );
                      return (
                        <>
                          {rows.slice(page * 10, page * 10 + 10).map((a) => (
                            <View
                              key={a.id}
                              style={[s.tableRow, { borderColor: c.line }]}
                            >
                              <View style={s.grow}>
                                <Badge
                                  title={
                                    a.severity === "critical"
                                      ? "Nghiêm trọng"
                                      : a.severity === "warning"
                                        ? "Cảnh báo"
                                        : "Thông tin"
                                  }
                                  tone={
                                    a.severity === "critical" ? "bad" : "warn"
                                  }
                                />
                                <Label bold>{a.title}</Label>
                                <Label muted size={12}>
                                  {a.deviceId} · {a.count} lần ·{" "}
                                  {a.updatedAt > 0 ? time(a.updatedAt) : "Chưa đồng bộ thời gian"}
                                </Label>
                                <Label muted size={12}>
                                  {a.assignee || "Chưa phân công"}
                                  {a.note ? ` · ${a.note}` : ""}
                                </Label>
                              </View>
                              <View style={{ gap: 8 }}>
                                <Badge title={alertStatuses[a.status]} />
                                {canOperate && a.source !== 'device' && (
                                  <Button
                                    title="Xử lý"
                                    onPress={() =>
                                      openEditor(
                                        a.title,
                                        "alert",
                                        a.id,
                                        [
                                          {
                                            key: "status",
                                            label: "Trạng thái",
                                            choices: Object.entries(
                                              alertStatuses,
                                            ).map(([value, label]) => ({
                                              value,
                                              label,
                                            })),
                                          },
                                          {
                                            key: "assignee",
                                            label: "Người phụ trách",
                                          },
                                          {
                                            key: "note",
                                            label: "Ghi chú xử lý",
                                          },
                                        ],
                                        {
                                          status: a.status,
                                          assignee: a.assignee,
                                          note: a.note,
                                        },
                                      )
                                    }
                                  />
                                )}
                              </View>
                            </View>
                          ))}
                          {empty(rows.length)}
                          {pager(rows.length)}
                        </>
                      );
                    })()}
                  </Panel>
                )}
                {tab === "revenue" && canFinance && (
                  <>
                    <View style={s.wrap}>
                      {(["today", "month", "year"] as const).map((key, i) => (
                        <View
                          key={key}
                          style={[
                            s.metric,
                            { backgroundColor: c.surface, borderColor: c.line },
                          ]}
                        >
                          <Label muted>
                            {["Hôm nay", "Tháng này", "Năm nay"][i]}
                          </Label>
                          <Label size={25} bold>
                            {report
                              ? money(report[key].gross - report[key].refunds)
                              : "—"}
                          </Label>
                          <Label muted size={11}>
                            Sau hoàn tiền · theo bộ lọc thiết bị
                          </Label>
                        </View>
                      ))}
                    </View>
                    {chart}
                    <Panel title="Chi tiết kỳ báo cáo">
                      <View style={s.wrap}>
                        {[
                          ["Thanh toán thành công", money(metrics.gross)],
                          ["Hoàn tiền", money(metrics.refunds)],
                          [
                            "Sau hoàn tiền",
                            money(metrics.gross - metrics.refunds),
                          ],
                          ["Giao dịch thành công", String(metrics.success)],
                          [
                            "Thất bại / Đang chờ",
                            `${metrics.failed} / ${metrics.pending}`,
                          ],
                          ["Phiên sử dụng", String(metrics.sessions)],
                          [
                            "Thời lượng trung bình",
                            metrics.sessions
                              ? `${Math.round(metrics.duration / metrics.sessions)} giây`
                              : "—",
                          ],
                          [
                            "Giá trị giao dịch TB",
                            metrics.success
                              ? money(metrics.gross / metrics.success)
                              : "—",
                          ],
                        ].map(([label, value]) => (
                          <View
                            key={label}
                            style={{
                              minWidth: 180,
                              flexGrow: 1,
                              gap: 6,
                              padding: 12,
                            }}
                          >
                            <Label muted size={12}>
                              {label}
                            </Label>
                            <Label size={20} bold>
                              {report ? value : "—"}
                            </Label>
                          </View>
                        ))}
                      </View>
                      <Button
                        title="Xuất CSV báo cáo"
                        disabled={!report}
                        onPress={() =>
                          void exportRows(
                            [
                              [
                                "Ngày",
                                "Thanh toán VND",
                                "Hoàn tiền VND",
                                "Sau hoàn tiền VND",
                                "Thành công",
                                "Thất bại",
                                "Đang chờ",
                                "Phiên",
                              ],
                              ...(report?.days ?? []).map((d) => [
                                d.day,
                                d.gross,
                                d.refunds,
                                d.gross - d.refunds,
                                d.success,
                                d.failed,
                                d.pending,
                                d.sessions,
                              ]),
                            ],
                            `doanh-thu-${range.start}-${range.end}`,
                          )
                        }
                      />
                      <Label muted size={12}>
                        Không bao gồm nạp mô phỏng. Hoàn tiền được ghi nhận vào
                        ngày hoàn tiền. Đây là doanh thu, chưa trừ chi phí.
                      </Label>
                    </Panel>
                    <View style={s.columns}>
                      <View style={s.column}>
                        <Panel title="Thiết bị doanh thu cao">
                          {report?.ranking.slice(0, 10).map((r, i) => (
                            <View
                              key={r.id}
                              style={[s.tableRow, { borderColor: c.line }]}
                            >
                              <Label muted>{i + 1}</Label>
                              <View style={s.grow}>
                                <Label bold>{r.name}</Label>
                                <Label muted size={12}>
                                  {r.id}
                                </Label>
                              </View>
                              <Label bold>{money(r.net)}</Label>
                            </View>
                          ))}
                          {empty(report?.ranking.length ?? 0)}
                        </Panel>
                      </View>
                      <View style={s.column}>
                        <Panel title="Phương thức thanh toán">
                          {Object.entries(report?.methods ?? {}).map(
                            ([method, count]) => (
                              <View key={method} style={{ gap: 7 }}>
                                <View style={s.between}>
                                  <Label>
                                    {(
                                      {
                                        bank: "Chuyển khoản",
                                        cash: "Tiền mặt",
                                        card: "Thẻ",
                                      } as Record<string, string>
                                    )[method] ?? method}
                                  </Label>
                                  <Label bold>{count} giao dịch</Label>
                                </View>
                                <View
                                  style={{
                                    height: 7,
                                    backgroundColor: c.soft,
                                    borderRadius: 4,
                                  }}
                                >
                                  <View
                                    style={{
                                      height: 7,
                                      borderRadius: 4,
                                      width: `${(count / Math.max(1, ...Object.values(report?.methods ?? {}))) * 100}%`,
                                      backgroundColor: c.accent,
                                    }}
                                  />
                                </View>
                              </View>
                            ),
                          )}
                          {empty(Object.keys(report?.methods ?? {}).length)}
                        </Panel>
                        <View style={{ height: 16 }} />
                        <Panel title="Giờ cao điểm">
                          <View style={s.wrap}>
                            {Object.entries(report?.hours ?? {})
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([hour, count]) => (
                                <View
                                  key={hour}
                                  style={[
                                    s.chip,
                                    {
                                      backgroundColor: c.soft,
                                      borderColor: c.line,
                                    },
                                  ]}
                                >
                                  <Label>
                                    {hour}h · {count} phiên
                                  </Label>
                                </View>
                              ))}
                          </View>
                          {empty(Object.keys(report?.hours ?? {}).length)}
                        </Panel>
                      </View>
                    </View>
                  </>
                )}
                {tab === "transactions" && canFinance && (
                  <Panel
                    title="Sổ giao dịch đã xác minh"
                    subtitle="50 bản ghi mỗi lần tải · Tìm kiếm và xuất CSV trên các bản ghi đã tải"
                  >
                    <Input
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Tìm mã giao dịch hoặc thiết bị…"
                    />
                    <Chips
                      value={status}
                      onChange={setStatus}
                      values={[
                        { value: "all", label: "Tất cả" },
                        { value: "success", label: "Thành công" },
                        { value: "pending", label: "Đang chờ" },
                        { value: "failed", label: "Thất bại" },
                      ]}
                    />
                    {(() => {
                      const rows = entries.filter(
                        (e) =>
                          (!branch || e.branchId === branch) &&
                          (!device || e.deviceId === device) &&
                          matching(`${e.id} ${e.deviceId}`) &&
                          (status === "all" || e.status === status),
                      );
                      return (
                        <>
                          {rows.slice(page * 10, page * 10 + 10).map((e) => (
                            <Pressable
                              key={e.id}
                              onPress={() =>
                                openEditor(
                                  `Giao dịch ${e.id}`,
                                  "readonly",
                                  e.id,
                                  [],
                                  {
                                    ...Object.fromEntries(
                                      Object.entries(e).map(([k, v]) => [
                                        k,
                                        String(v),
                                      ]),
                                    ),
                                    occurredAt: time(e.occurredAt),
                                  },
                                )
                              }
                              style={[s.tableRow, { borderColor: c.line }]}
                            >
                              <View style={s.grow}>
                                <Label bold>{e.id}</Label>
                                <Label muted size={12}>
                                  {e.deviceId} · {time(e.occurredAt)} ·{" "}
                                  {e.kind === "refund"
                                    ? "Hoàn tiền"
                                    : e.kind === "session"
                                      ? "Phiên chơi"
                                      : e.paymentMethod}
                                </Label>
                              </View>
                              <View style={{ gap: 5 }}>
                                <Label bold>{money(e.amount)}</Label>
                                <Badge
                                  title={
                                    e.status === "success"
                                      ? "Thành công"
                                      : e.status === "failed"
                                        ? "Thất bại"
                                        : "Đang chờ"
                                  }
                                  tone={
                                    e.status === "success" ? "good" : "warn"
                                  }
                                />
                              </View>
                            </Pressable>
                          ))}
                          {empty(rows.length)}
                          {pager(rows.length)}
                          <View style={s.wrap}>
                            <Button
                              title="Tải thêm giao dịch"
                              disabled={!cursor || busy}
                              onPress={() =>
                                void readLedger(cursor ?? undefined)
                              }
                            />
                            <Button
                              title={`Xuất ${rows.length} giao dịch đã lọc`}
                              disabled={!rows.length}
                              onPress={() =>
                                void exportRows(
                                  [
                                    [
                                      "Mã",
                                      "Thiết bị",
                                      "Chi nhánh",
                                      "Loại",
                                      "Trạng thái",
                                      "Số tiền VND",
                                      "Thời gian",
                                    ],
                                    ...rows.map((e) => [
                                      e.id,
                                      e.deviceId,
                                      e.branchId,
                                      e.kind,
                                      e.status,
                                      e.amount,
                                      time(e.occurredAt),
                                    ]),
                                  ],
                                  "giao-dich-da-tai",
                                )
                              }
                            />
                          </View>
                        </>
                      );
                    })()}
                  </Panel>
                )}
                {tab === "branches" && (
                  <Panel title="Chi nhánh">
                    {canManage && (
                      <Button
                        title="+ Thêm chi nhánh"
                        primary
                        onPress={() =>
                          openEditor(
                            "Thêm chi nhánh",
                            "branch",
                            `B${Date.now()}`,
                            [
                              { key: "name", label: "Tên chi nhánh" },
                              { key: "address", label: "Địa chỉ" },
                              { key: "manager", label: "Người phụ trách" },
                            ],
                            { name: "", address: "", manager: "" },
                          )
                        }
                      />
                    )}
                    {data.branches.map((b) => (
                      <View
                        key={b.id}
                        style={[s.tableRow, { borderColor: c.line }]}
                      >
                        <View style={s.grow}>
                          <Label bold>{b.name}</Label>
                          <Label muted>{b.address}</Label>
                          <Label muted size={12}>
                            {b.manager} ·{" "}
                            {
                              data.devices.filter((d) => d.branchId === b.id)
                                .length
                            }{" "}
                            thiết bị
                          </Label>
                        </View>
                        {canManage && (
                          <Button
                            title="Chỉnh sửa"
                            onPress={() =>
                              openEditor(
                                "Chỉnh sửa chi nhánh",
                                "branch",
                                b.id,
                                [
                                  { key: "name", label: "Tên chi nhánh" },
                                  { key: "address", label: "Địa chỉ" },
                                  { key: "manager", label: "Người phụ trách" },
                                ],
                                {
                                  name: b.name,
                                  address: b.address,
                                  manager: b.manager,
                                },
                              )
                            }
                          />
                        )}
                      </View>
                    ))}
                    {empty(data.branches.length)}
                  </Panel>
                )}
                {tab === "maintenance" && (
                  <Panel title="Lịch bảo trì">
                    {deviceList.filter(isMaintenance).map(d => (
                      <View key={`live-${d.id}`} style={[s.banner, { backgroundColor: c.soft }]}>
                        <View style={s.grow}>
                          <Label bold>{d.name || d.id} · Đang ở chế độ bảo trì</Label>
                          <Label muted>{d.id} · Máy tạm ngừng phục vụ. Trạng thái cập nhật từ thiết bị.</Label>
                        </View>
                        <Badge title={states[deviceState(d, now, data.settings.offlineSeconds)]} tone="warn" />
                        {canOperate && <Button title="Lên lịch xử lý" onPress={() => openMaintenance(undefined, d.id)} />}
                      </View>
                    ))}
                    {canOperate && (
                      <Button
                        title="+ Lên lịch bảo trì"
                        primary
                        disabled={!data.devices.length}
                        onPress={() => openMaintenance()}
                      />
                    )}
                    {data.maintenance
                      .filter((m) =>
                        deviceList.some((d) => d.id === m.deviceId),
                      )
                      .map((m) => (
                        <View
                          key={m.id}
                          style={[s.tableRow, { borderColor: c.line }]}
                        >
                          <View style={s.grow}>
                            <Label bold>
                              {m.deviceId} · {m.dueDate}
                            </Label>
                            <Label muted>{m.note}</Label>
                            <Label muted size={12}>
                              {m.assignee || "Chưa phân công"} · {money(m.cost)}
                            </Label>
                          </View>
                          <View style={{ gap: 8 }}>
                            <Badge
                              title={
                                m.completed
                                  ? "Hoàn tất"
                                  : m.dueDate < dateKey()
                                    ? "Quá hạn"
                                    : "Đã lên lịch"
                              }
                              tone={m.completed ? "good" : "warn"}
                            />
                            {canOperate && (
                              <Button
                                title="Cập nhật"
                                onPress={() => openMaintenance(m)}
                              />
                            )}
                          </View>
                        </View>
                      ))}
                    {empty(
                      data.maintenance.filter((m) =>
                        deviceList.some((d) => d.id === m.deviceId),
                      ).length + deviceList.filter(isMaintenance).length,
                    )}
                  </Panel>
                )}
                {tab === "users" && isSuper && (
                  <Panel
                    title="Tài khoản và phân quyền"
                    subtitle="Tài khoản phải có trong accounts trên Realtime Database trước khi cấp quyền."
                  >
                    <Button
                      title="+ Cấp quyền tài khoản"
                      primary
                      onPress={() => openAccess()}
                    />
                    {data.users.map((u) => (
                      <View
                        key={u.uid}
                        style={[s.tableRow, { borderColor: c.line }]}
                      >
                        <View style={s.grow}>
                          <Label bold>{accountName(u.email)}</Label>
                          <Label muted size={12}>
                            {roles[u.role]} ·{" "}
                            {u.branchId
                              ? branchName(u.branchId)
                              : "Tất cả chi nhánh"}
                          </Label>
                        </View>
                        <Button
                          title="Phân quyền"
                          disabled={busy || !!u.isDefaultAdmin || u.uid === data.access.uid}
                          onPress={() => openAccess(u)}
                        />
                        <Button
                          title="Thu hồi quyền admin"
                          disabled={busy || !!u.isDefaultAdmin || u.uid === data.access.uid}
                          onPress={() => openEditor('Xác nhận thu hồi quyền admin', 'access', u.uid, [], { email: u.email, role: u.role, branchId: u.branchId, revoke: 'true' })}
                        />
                      </View>
                    ))}
                  </Panel>
                )}
                {tab === "audit" && canManage && (
                  <Panel
                    title="Nhật ký quản trị"
                    subtitle="100 thay đổi gần nhất trên Realtime Database"
                  >
                    {data.audit.map((a) => (
                      <Pressable
                        key={a.id}
                        onPress={() =>
                          openEditor("Chi tiết nhật ký", "readonly", a.id, [], {
                            actor: a.actor,
                            action: a.action,
                            target: a.target,
                            at: time(a.at),
                            before: JSON.stringify(a.before ?? null, null, 2),
                            after: JSON.stringify(a.after ?? null, null, 2),
                          })
                        }
                        style={[s.tableRow, { borderColor: c.line }]}
                      >
                        <View style={s.grow}>
                          <Label bold>
                            {a.action} · {a.target}
                          </Label>
                          <Label muted size={12}>
                            {a.actor}
                          </Label>
                        </View>
                        <Label muted size={12}>
                          {time(a.at)}
                        </Label>
                      </Pressable>
                    ))}
                    {empty(data.audit.length)}
                  </Panel>
                )}
                {tab === "settings" && (
                  <Panel title="Cấu hình hệ thống">
                    <Label>Múi giờ báo cáo: Asia/Ho_Chi_Minh (UTC+7)</Label>
                    <Label>Đơn vị tiền tệ: VND</Label>
                    <Label>
                      Ngưỡng mất kết nối: {data.settings.offlineSeconds} giây
                    </Label>
                    <Label muted>
                      Thông báo trong ứng dụng hiển thị ở mục Cảnh báo.
                      Email/push và điều khiển từ xa cần tích hợp thêm với dịch
                      vụ thông báo và firmware.
                    </Label>
                    {isSuper && (
                      <Button
                        title="Chỉnh ngưỡng mất kết nối"
                        onPress={() =>
                          openEditor(
                            "Cấu hình cảnh báo",
                            "settings",
                            "system",
                            [
                              {
                                key: "offlineSeconds",
                                label: "Mất kết nối sau (30–3600 giây)",
                                numeric: true,
                              },
                            ],
                            {
                              offlineSeconds: String(
                                data.settings.offlineSeconds,
                              ),
                            },
                          )
                        }
                      />
                    )}
                  </Panel>
                )}
              </>
            )}
          </FormScrollView>
        </View>
      </View>
      </KeyboardForm>
      <Modal
        visible={!!editor && !!data}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!busy) setEditor(null);
        }}
      >
        <KeyboardForm style={s.overlay}>
          <View
            style={[
              s.modal,
              {
                backgroundColor: c.surface,
                maxHeight: "90%",
                width: Math.min(width - 32, 600),
              },
            ]}
          >
            <FormScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
              <Label size={21} bold>
                {editor?.title}
              </Label>
              {editor?.fields.length === 0 ? (
                Object.entries(editor?.values ?? {}).map(([key, value]) => (
                  <View key={key}>
                    <Label muted size={12}>
                      {key}
                    </Label>
                    <Label>{value || "—"}</Label>
                  </View>
                ))
              ) : (
                <>
                  {Object.entries(editor?.values ?? {})
                    .filter(
                      ([key]) => !editor?.fields.some((f) => f.key === key),
                    )
                    .map(([key, value]) => (
                      <Label key={key} muted size={12}>
                        {key}: {value}
                      </Label>
                    ))}
                  {editor?.fields.map((field) => (
                    <View key={field.key} style={{ gap: 8 }}>
                      <Label bold>{field.label}</Label>
                      {field.choices ? (
                        <Chips
                          values={field.choices}
                          value={editor.values[field.key] ?? ""}
                          onChange={(v) =>
                            setEditor((old) =>
                              old
                                ? {
                                    ...old,
                                    values: { ...old.values, [field.key]: v },
                                  }
                                : null,
                            )
                          }
                        />
                      ) : (
                        <Input
                          value={editor.values[field.key] ?? ""}
                          placeholder={field.label}
                          onChangeText={(v) =>
                            setEditor((old) =>
                              old
                                ? {
                                    ...old,
                                    values: { ...old.values, [field.key]: v },
                                  }
                                : null,
                            )
                          }
                        />
                      )}
                    </View>
                  ))}
                </>
              )}
              {notice ? <Label>{notice}</Label> : null}
              <View style={s.wrap}>
                <Button
                  title="Đóng"
                  disabled={busy}
                  onPress={() => {
                    setEditor(null);
                    setNotice("");
                  }}
                />
                {(!!editor?.fields.length || editor?.action === 'access') && (
                  <Button
                    title={busy ? "Đang lưu…" : "Xác nhận và lưu"}
                    primary
                    disabled={busy}
                    onPress={() => void submit()}
                  />
                )}
              </View>
            </FormScrollView>
          </View>
        </KeyboardForm>
      </Modal>
    </SafeAreaView>
  );

  function openMaintenance(m?: AdminSnapshot["maintenance"][number], deviceId?: string) {
    openEditor(
      m ? "Cập nhật bảo trì" : "Lên lịch bảo trì",
      "maintenance",
      m?.id ?? `M${Date.now()}`,
      [
        { key: "deviceId", label: "Thiết bị", choices: deviceChoices },
        { key: "dueDate", label: "Ngày bảo trì YYYY-MM-DD" },
        { key: "assignee", label: "Người phụ trách" },
        { key: "note", label: "Nội dung bảo trì" },
        { key: "cost", label: "Chi phí VND", numeric: true },
        {
          key: "completed",
          label: "Trạng thái",
          choices: [
            { value: "false", label: "Đã lên lịch" },
            { value: "true", label: "Hoàn tất" },
          ],
        },
      ],
      {
        deviceId: m?.deviceId ?? deviceId ?? data?.devices[0]?.id ?? "",
        dueDate: m?.dueDate ?? dateKey(),
        assignee: m?.assignee ?? "",
        note: m?.note ?? "",
        cost: String(m?.cost ?? 0),
        completed: String(m?.completed ?? false),
      },
    );
  }
  function openAccess(u?: AdminSnapshot["users"][number]) {
    openEditor(
      "Phân quyền tài khoản",
      "access",
      u?.uid ?? "new",
      [
        { key: "email", label: "Tên tài khoản" },
        {
          key: "role",
          label: "Vai trò",
          choices: Object.entries(roles).map(([value, label]) => ({
            value,
            label,
          })),
        },
        {
          key: "branchId",
          label: "Phạm vi chi nhánh",
          choices: [
            { value: "", label: "Tất cả chi nhánh" },
            ...branchChoices.filter((b) => b.value),
          ],
        },
      ],
      {
        email: accountName(u?.email),
        role: u?.role ?? "viewer",
        branchId: u?.branchId ?? "",
      },
    );
  }
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  column: { flex: 1, minWidth: 280 },
  sidebar: { width: 240, borderRightWidth: 1, padding: 12 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
    marginBottom: 5,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 17,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  panel: { padding: 20, borderWidth: 1, borderRadius: 16, gap: 14 },
  metric: {
    flexGrow: 1,
    flexBasis: 210,
    padding: 21,
    borderWidth: 1,
    borderRadius: 16,
    gap: 10,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    flexWrap: "wrap",
  },
  input: {
    borderWidth: 1,
    borderRadius: 9,
    padding: 12,
    fontSize: 14,
    minWidth: 150,
  },
  button: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  banner: {
    padding: 13,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  overlay: {
    flex: 1,
    backgroundColor: "#00000077",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: { borderRadius: 18, padding: 24 },
});
