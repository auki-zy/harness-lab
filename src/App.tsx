import { ConfigProvider } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useAppData } from './shared/data';
import { writeApiAvailable } from './shared/trial-api';
import { HomePage } from './pages/home';
import { DetailPanel } from './components';

const FONT_SANS =
  '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", system-ui, -apple-system, sans-serif';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  // 写接口（发起评测 / 提交人评 / 给能力下结论）只在 `npm run dev` 下存在：没有它，页面退回纯展示
  const [canWrite, setCanWrite] = useState(false);
  useEffect(() => {
    writeApiAvailable().then(setCanWrite);
  }, []);
  // 数据从 store 读：写完会就地刷新（不再整页 reload，抽屉状态得以保留）
  const { capabilities, taxonomy, pendingTags } = useAppData();
  const current = useMemo(() => capabilities.find((c) => c.id === openId) ?? null, [capabilities, openId]);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1d4e48',
          colorInfo: '#1d4e48',
          colorSuccess: '#1d6b57',
          colorWarning: '#8f6414',
          colorError: '#ae3b2c',
          colorText: '#17191b',
          colorTextSecondary: '#5c6670',
          colorTextTertiary: '#7a828a',
          colorBorder: '#d5dad2',
          colorBorderSecondary: '#e4e8e1',
          colorBgContainer: '#f7f8f5',
          colorBgElevated: '#f7f8f5',
          borderRadius: 3,
          fontFamily: FONT_SANS,
          fontSize: 14,
          controlHeight: 34,
          wireframe: false,
        },
        components: {
          Drawer: { paddingLG: 24 },
        },
      }}
    >
      <HomePage
        capabilities={capabilities}
        taxonomy={taxonomy}
        pendingTags={pendingTags}
        onOpen={setOpenId}
        canWrite={canWrite}
      />
      <DetailPanel
        capability={current}
        taxonomy={taxonomy}
        pending={pendingTags}
        onClose={() => setOpenId(null)}
        canReview={canWrite}
      />
    </ConfigProvider>
  );
}
