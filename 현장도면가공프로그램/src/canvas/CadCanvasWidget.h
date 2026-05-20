#pragma once

#include <QWidget>

namespace yjcad {

class CadCanvasWidget final : public QWidget {
    Q_OBJECT

public:
    explicit CadCanvasWidget(QWidget* parent = nullptr);

protected:
    void paintEvent(QPaintEvent* event) override;
};

} // namespace yjcad
