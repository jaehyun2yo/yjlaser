#include "canvas/CadCanvasWidget.h"

#include <QColor>
#include <QPainter>
#include <QPaintEvent>
#include <QPen>
#include <QString>
#include <Qt>

namespace yjcad {

CadCanvasWidget::CadCanvasWidget(QWidget* parent)
    : QWidget(parent)
{
    setMinimumSize(720, 480);
    setAutoFillBackground(false);
}

void CadCanvasWidget::paintEvent(QPaintEvent* event)
{
    Q_UNUSED(event);

    QPainter painter(this);
    painter.fillRect(rect(), QColor(28, 31, 34));
    painter.setRenderHint(QPainter::Antialiasing, true);

    painter.setPen(QPen(QColor(70, 76, 82), 1));
    constexpr int grid = 32;
    for (int x = 0; x < width(); x += grid) {
        painter.drawLine(x, 0, x, height());
    }
    for (int y = 0; y < height(); y += grid) {
        painter.drawLine(0, y, width(), y);
    }

    painter.setPen(QColor(214, 221, 228));
    painter.drawText(rect(), Qt::AlignCenter, QStringLiteral("CAD 캔버스 준비"));
}

} // namespace yjcad
