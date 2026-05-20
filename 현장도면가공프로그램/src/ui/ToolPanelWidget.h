#pragma once

#include <QWidget>

namespace yjcad {

class ToolPanelWidget final : public QWidget {
    Q_OBJECT

public:
    explicit ToolPanelWidget(QWidget* parent = nullptr);
};

} // namespace yjcad
