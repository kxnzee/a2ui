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
  const sending = useRef(false);
  const cancelRef = useRef<() => void>(() => {});
  failRef.current = failSend;
  const a2ui = useA2ui({ onAction: async message => {
    const surface = a2ui.processor.model.getSurface(message.action.surfaceId);
    if (sending.current || !surface) return;
    sending.current = true;
    const current = generation.current;
    const setDisabled = (value: boolean) => {
      if (current === generation.current && a2ui.processor.model.getSurface(message.action.surfaceId) === surface) {
        a2ui.processor.processMessages([{ version: 'v0.9', updateDataModel: {
          surfaceId: message.action.surfaceId, path: '/disabled', value,
        } }]);
      }
    };
    setDisabled(true);
    setError('');
    try {
      await new Promise(resolve => setTimeout(resolve, 400));
      if (current !== generation.current) return;
      if (failRef.current) throw new Error('Демонстрационная ошибка отправки. Выберите вариант ещё раз.');
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
    } catch (error) {
      if (current === generation.current) {
        setError(error instanceof Error ? error.message : 'Ошибка отправки');
        setDisabled(false);
        // Карточка заблокирована выбором; сброс selected разрешает повтор.
        if (a2ui.processor.model.getSurface(message.action.surfaceId) === surface) {
          a2ui.processor.processMessages([{ version: 'v0.9', updateDataModel: {
            surfaceId: message.action.surfaceId, path: '/selected', value: '',
          } }]);
        }
      }
    } finally {
      if (current === generation.current) sending.current = false;
    }
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
  useEffect(() => () => { generation.current++; cancelRef.current(); }, []);

  function start() {
    a2ui.clear();
    setAnswer(undefined);
    generation.current++;
    sending.current = false;
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
      {error && <Alert type="error" message={error} />}
      <A2uiView processor={a2ui.processor} />
      {answer && <Card title="Событие для существующего запроса"><pre>{JSON.stringify(answer, null, 2)}</pre></Card>}
    </main>
  </ConfigProvider>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
