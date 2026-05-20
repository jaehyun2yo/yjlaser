#pragma once

#include <QWidget>

namespace yjcad {

class StatusLogWidget final : public QWidget {
    Q_OBJECT

public:
    explicit StatusLogWidget(QWidget* parent = nullptr);
};

} // namespace yjcad
