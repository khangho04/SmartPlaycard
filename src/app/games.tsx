import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Action, UserBox, UserPage, UserText } from '@/components/user-page';
import { useWallet } from '@/contexts/wallet-context';
import { formatBalance } from '@/services/wallet-mapping';
export default function Games() {
  const { data, isReady } = useWallet(); const [branch, setBranch] = useState('');
  return <UserPage title="Trò chơi">
    <UserText>Chọn chi nhánh để xem game. Quẹt thẻ tại máy để chơi.</UserText>
    <View style={{ gap: 8 }}><Action title="Tất cả chi nhánh" onPress={() => setBranch('')} />{data?.branches.map((b) => <Action key={b.id} title={`${branch === b.id ? '✓ ' : ''}${b.name}`} onPress={() => setBranch(b.id)} />)}</View>
    {!isReady ? <UserText>Đang tải...</UserText> : !data?.games.length ? <UserText>Chưa có trò chơi được công bố.</UserText> : null}
    {data?.games.filter((g) => !branch || g.branchId === branch).map((g) => <UserBox key={g.id}>
      <UserText>{g.name}</UserText><UserText>{g.description}</UserText>
      <UserText>{data.branches.find((b) => b.id === g.branchId)?.name || g.branchId} · Máy {g.deviceId}</UserText>
      <UserText>{formatBalance(g.price)} / lượt · {g.durationSeconds} giây</UserText>
      <UserText>{g.available ? g.status === 'playing' ? 'Máy đang có người chơi' : 'Máy sẵn sàng' : 'Chưa sẵn sàng / đang chờ đồng bộ máy'}</UserText>
      <Action title="Hỗ trợ về game này" onPress={() => router.push({ pathname: '/support', params: { gameId: g.id } })} />
    </UserBox>)}
  </UserPage>;
}
