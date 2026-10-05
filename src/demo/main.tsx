import { getDemoMessages } from './messages.js';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Card, Checkbox, ConfigProvider, Space, Typography } from 'antd';
import { A2uiView, useA2ui, type A2uiActionMessage } from '../a2ui/index.js';
import './style.css';

function Demo() {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<A2uiActionMessage>();
  const [error, setError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [failSend, setFailSend] = useState(false);
  const failRef = useRef(false);
  const generation = useRef(0);
  const cancelRef = useRef<() => void>(() => {});
  failRef.current = failSend;
  const a2ui = useA2ui({ onAction: async message => {
    const current = generation.current;
    await new Promise(resolve => setTimeout(resolve, 400));
    if (current !== generation.current) return;
    if (failRef.current) throw new Error('Демонстрационная ошибка');
    setAnswer(message);
    const metricMessages = getDemoMessages().metric;
    const update = metricMessages[1];
    if ('updateComponents' in update && message.action.context.optionId === 'orders') {
      Object.assign(update.updateComponents.components[0], { title: 'Количество заказов', value: 320, unit: 'шт.' });
    }
    const messages = [
      { version: 'v0.9', deleteSurface: { surfaceId: message.action.surfaceId } }, ...metricMessages,
    ];
    play(`Демонстрационные данные.\n${frame(messages)}`);
  } });
  function frame(messages: unknown[]) {
    return messages.map(message => `<a2ui>${JSON.stringify(message)}</a2ui>`).join('\n');
  }

  function play(response: string) {
    cancelRef.current();
    setText('');
    setError('');
    setStreaming(true);
    const decoder = a2ui.beginResponse({
      onText: delta => setText(value => value + delta),
      onError: e => setError(e.message),
    });
    // Эмулятор выдаёт по одному символу: теги и JSON разорваны между чанками.
    let position = 0;
    const timer = setInterval(() => {
      if (position < response.length) decoder.push(response[position++]);
      else {
        clearInterval(timer);
        decoder.finish();
        setStreaming(false);
      }
    }, 8);
    cancelRef.current = () => { clearInterval(timer); decoder.cancel(); };
  }
  useEffect(() => () => { cancelRef.current(); }, []);

  function start() {
    a2ui.clear();
    setAnswer(undefined);
    generation.current++;
    play(`Уточню один момент.\n${frame(getDemoMessages().clarification)}`);
  }

  return <ConfigProvider theme={{ token: { colorPrimary: '#3458d6', borderRadius: 12 } }}>
    <main>
      <Typography.Title>A2UI · два компонента в стриме</Typography.Title>
      <Typography.Paragraph>React + Ant Design. Запрос к агенту в этом примере эмулируется; UI показывает уточнение, затем числовой результат. Все цифры в демо тестовые.</Typography.Paragraph>
      <Space wrap>
        <Button type="primary" onClick={start}>Запустить / начать заново</Button>
        <Checkbox checked={failSend} onChange={e => setFailSend(e.target.checked)}>Эмулировать ошибку отправки</Checkbox>
      </Space>
      <Card title={streaming ? 'Агент печатает…' : 'Ответ агента'}><div className="message">{text || 'Нажмите «Запустить».'}</div></Card>
      {error && <Alert type="error" title={error} />}
      <A2uiView controller={a2ui.controller} />
      {answer && <Card title="Событие для существующего запроса"><pre>{JSON.stringify(answer, null, 2)}</pre></Card>}
    </main>
  </ConfigProvider>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
