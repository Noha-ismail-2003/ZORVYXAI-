import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ZORVYX ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: '#080814',
            color: '#f7f7ff',
            fontFamily: 'Tahoma, Arial, sans-serif',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: 440,
              background: '#141428',
              border: '1px solid #3c3a62',
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 20 }}>حدث خطأ غير متوقع</h2>
            <p style={{ color: '#a6a6c2', fontSize: 13, lineHeight: 1.8 }}>
              تم حفظ أعمالك ومحادثاتك محلياً. يمكنك إعادة تحميل الصفحة للمتابعة فوراً.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              style={{
                border: 0,
                borderRadius: 12,
                padding: '12px 22px',
                background: 'linear-gradient(110deg, #a78bfa, #67e8f9)',
                color: '#111126',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              إعادة تشغيل زورفيكس للذكاء الاصطناعي
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
