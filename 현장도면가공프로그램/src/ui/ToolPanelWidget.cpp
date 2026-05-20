#include "ui/ToolPanelWidget.h"

#include <QPushButton>
#include <QString>
#include <QStringList>
#include <QVBoxLayout>

namespace yjcad {

ToolPanelWidget::ToolPanelWidget(QWidget* parent)
    : QWidget(parent)
{
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(8, 8, 8, 8);
    layout->setSpacing(6);

    const QStringList tools = {
        QStringLiteral("선택"),
        QStringLiteral("이동"),
        QStringLiteral("삭제"),
        QStringLiteral("레이어/색"),
        QStringLiteral("선"),
        QStringLiteral("원"),
        QStringLiteral("호"),
        QStringLiteral("폴리라인"),
        QStringLiteral("텍스트")
    };

    for (const auto& label : tools) {
        auto* button = new QPushButton(label, this);
        button->setMinimumHeight(30);
        layout->addWidget(button);
    }

    layout->addStretch(1);
}

} // namespace yjcad
