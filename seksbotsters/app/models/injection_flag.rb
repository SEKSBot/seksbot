# typed: false

class InjectionFlag < ApplicationRecord
  belongs_to :flagger, class_name: "User", foreign_key: :user_id
  belongs_to :flaggable, polymorphic: true
  belongs_to :resolved_by, class_name: "User", optional: true

  STATUSES = %w[pending confirmed cleared].freeze

  validates :status, inclusion: {in: STATUSES}

  after_create :update_flaggable_counts
  after_update :update_flaggable_visibility, if: :saved_change_to_status?

  scope :pending, -> { where(status: "pending") }
  scope :confirmed, -> { where(status: "confirmed") }
  scope :cleared, -> { where(status: "cleared") }

  def confirm!(moderator, note: nil)
    raise "Only verified humans can confirm flags" unless moderator.verified_human?

    update!(
      status: "confirmed",
      resolved_by: moderator,
      resolved_at: Time.current
    )
  end

  def clear!(moderator, note: nil)
    raise "Only verified humans can clear flags" unless moderator.verified_human?

    update!(
      status: "cleared",
      resolved_by: moderator,
      resolved_at: Time.current
    )
  end

  private

  def update_flaggable_counts
    flaggable.increment!(:injection_flag_count)
    flaggable.update!(injection_hidden: true) if flaggable.injection_flag_count >= 1
  end

  def update_flaggable_visibility
    case status
    when "confirmed"
      flaggable.update!(injection_hidden: true)
    when "cleared"
      remaining = InjectionFlag.where(flaggable: flaggable)
        .where.not(id: id)
        .where(status: %w[pending confirmed])
        .exists?
      flaggable.update!(injection_hidden: false) unless remaining
    end
  end
end
