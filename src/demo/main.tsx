import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Card, Checkbox, ConfigProvider, Space, Typography } from 'antd';
import { ClarificationSurface, createClarificationController, createClarificationStream, type ClarificationAnswer } from '../ui/index.js';
import './style.css';

function Demo() {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<ClarificationAnswer>();
  const [error, setError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [failSend, setFailSend] = useState(false);
  const failRef = useRef(false);
  const cancelRef = useRef<() => void>(() => {});
  failRef.current = failSend;
  const controller = useMemo(() => createClarificationController(async selected => {
    // Здесь подключается уже существующий запрос приложения.
    await new Promise(resolve => setTimeout(resolve, 400));
    if (controller.getQuestionId() !== selected.questionId) return;
    if (failRef.current) throw new Error('Демонстрационная ошибка');
    setAnswer(selected);
    play(`Спасибо! Вы выбрали «${selected.label}». Теперь агент может продолжить ответ.`);
  }), []);

  function play(response: string) {
    cancelRef.current();
    setText('');
    setError('');
    setStreaming(true);
    const decoder = createClarificationStream({
      onText: delta => setText(value => value + delta),
      onClarification: question => controller.showQuestion(question),
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
  useEffect(() => () => { cancelRef.current(); controller.dispose(); }, [controller]);

  function start() {
    controller.clear();
    setAnswer(undefined);
    const question = {
      questionId: `metric-${Date.now()}`, question: 'Какой показатель показать на графике?',
      options: [{ id: 'revenue', label: 'Выручка' }, { id: 'orders', label: 'Количество заказов' }],
    };
    play(`Уточню один момент.\n<clarification>${JSON.stringify(question)}</clarification>`);
  }

  return <ConfigProvider theme={{ token: { colorPrimary: '#3458d6', borderRadius: 12 } }}>
    <main>
      <Typography.Title>A2UI · уточнение в стриме</Typography.Title>
      <Typography.Paragraph>React + Ant Design. Запрос к агенту в этом примере эмулируется; UI принимает текстовые чанки и возвращает выбранный ответ вашему приложению.</Typography.Paragraph>
      <Space wrap>
        <Button type="primary" onClick={start}>Запустить / начать заново</Button>
        <Checkbox checked={failSend} onChange={e => setFailSend(e.target.checked)}>Эмулировать ошибку отправки</Checkbox>
      </Space>
      <Card title={streaming ? 'Агент печатает…' : 'Ответ агента'}><div className="message">{text || 'Нажмите «Запустить».'}</div></Card>
      {error && <Alert type="error" title={error} />}
      <ClarificationSurface controller={controller} />
      {answer && <Card title="Событие для существующего запроса"><pre>{JSON.stringify(answer, null, 2)}</pre></Card>}
    </main>
  </ConfigProvider>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
