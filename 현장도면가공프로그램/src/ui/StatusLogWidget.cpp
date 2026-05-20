#include "ui/StatusLogWidget.h"

#include <QHBoxLayout>
#include <QLabel>
#include <QString>

namespace yjcad {

StatusLogWidget::StatusLogWidget(QWidget* parent)
    : QWidget(parent)
{
    auto* layout = new QHBoxLayout(this);
    layout->setContentsMargins(8, 4, 8, 4);
    layout->addWidget(new QLabel(QStringLiteral("좌표: 0, 0"), this));
    layout->addWidget(new QLabel(QStringLiteral("단위: mm"), this));
    layout->addWidget(new QLabel(QStringLiteral("선택: 0"), this));
    layout->addWidget(new QLabel(QStringLiteral("상태: 준비"), this), 1);
    layout->addWidget(new QLabel(QStringLiteral("성능 경고: 없음"), this));
}

} // namespace yjcad
